import express from 'express';
import cors from 'cors';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Enable stealth mode to bypass ChatGPT's bot detection
puppeteerExtra.use(StealthPlugin());

const app = express();
const port = 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const sqlitePath = path.join(dataDir, 'medpulse.sqlite');
const jsonFallbackPath = path.join(dataDir, 'patients.json');
const usersJsonFallbackPath = path.join(dataDir, 'users.json');

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(path.join(dataDir, 'uploads')));

let browser = null;
let page = null;
let isInitializing = false;
let sessionInitialized = false;

const REALISTIC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function runPython(script, args = [], stdinData = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-c', script, ...args], { cwd: __dirname });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Python exited with code ${code}`));
      }
    });
    if (stdinData !== null && child.stdin) {
      child.stdin.on('error', err => {
        console.error('[Server] Python stdin error:', err.message);
      });
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

async function listPatientsFromJsonFallback() {
  try {
    const raw = await fs.readFile(jsonFallbackPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function savePatientsToJsonFallback(patients) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(jsonFallbackPath, JSON.stringify(patients, null, 2));
}

async function listPatients() {
  await fs.mkdir(dataDir, { recursive: true });
  const script = `
import json, sqlite3, sys
db = sys.argv[1]
conn = sqlite3.connect(db)
conn.execute("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT, triage_level TEXT, routed_at TEXT, record_json TEXT NOT NULL)")
rows = conn.execute("SELECT record_json FROM patients ORDER BY routed_at DESC, id DESC").fetchall()
print(json.dumps([json.loads(row[0]) for row in rows]))
conn.close()
`;
  try {
    const sqlitePatients = JSON.parse(await runPython(script, [sqlitePath]));
    // If SQLite has 0 records but patients.json fallback has data, sync them
    if (sqlitePatients.length === 0) {
      const jsonPatients = await listPatientsFromJsonFallback();
      if (jsonPatients.length > 0) {
        console.log(`[Server] SQLite patients table empty; syncing ${jsonPatients.length} patients from patients.json fallback`);
        for (const patient of jsonPatients) {
          try {
            await savePatient(patient);
          } catch (err) {
            console.error('[Server] Failed to sync patient to SQLite:', patient.id, err.message);
          }
        }
        // Return the synced list
        return listPatients();
      }
    }
    return sqlitePatients;
  } catch (error) {
    console.warn('[Server] SQLite unavailable; using JSON fallback:', error.message);
    return listPatientsFromJsonFallback();
  }
}

async function savePatient(patient) {
  await fs.mkdir(dataDir, { recursive: true });
  const script = `
import json, sqlite3, sys
db = sys.argv[1]
payload = sys.stdin.read()
patient = json.loads(payload)
conn = sqlite3.connect(db)
conn.execute("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT, triage_level TEXT, routed_at TEXT, record_json TEXT NOT NULL)")
conn.execute("INSERT OR REPLACE INTO patients (id, name, triage_level, routed_at, record_json) VALUES (?, ?, ?, ?, ?)", (patient.get("id"), patient.get("name", ""), patient.get("triageLevel", ""), patient.get("routedAt", ""), json.dumps(patient)))
conn.commit()
conn.close()
`;
  try {
    await runPython(script, [sqlitePath], JSON.stringify(patient));
    return patient;
  } catch (error) {
    console.warn('[Server] SQLite unavailable; saving to JSON fallback:', error.message);
    const patients = await listPatientsFromJsonFallback();
    const withoutExisting = patients.filter(p => p.id !== patient.id);
    await savePatientsToJsonFallback([patient, ...withoutExisting]);
    return patient;
  }
}

async function deletePatient(id) {
  await fs.mkdir(dataDir, { recursive: true });
  const script = `
import sqlite3, sys
db, patient_id = sys.argv[1], sys.argv[2]
conn = sqlite3.connect(db)
conn.execute("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT, triage_level TEXT, routed_at TEXT, record_json TEXT NOT NULL)")
conn.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
conn.commit()
conn.close()
`;
  try {
    await runPython(script, [sqlitePath, id]);
  } catch (error) {
    console.warn('[Server] SQLite unavailable; deleting from JSON fallback:', error.message);
    const patients = await listPatientsFromJsonFallback();
    await savePatientsToJsonFallback(patients.filter(p => p.id !== id));
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

function defaultDoctorUser() {
  return {
    id: 'doctor-default',
    role: 'doctor',
    name: 'Doctor',
    email: 'doctor@medpulse.local',
    passwordHash: hashPassword('doctor123'),
    abhaId: '',
    age: 0,
    gender: '',
  };
}

function defaultPatientUser() {
  return {
    id: 'patient-sample',
    role: 'patient',
    name: 'Mohak Leader',
    email: 'mohak@medpulse.local',
    passwordHash: hashPassword('patient123'),
    abhaId: '91-8843-1250-9982',
    age: 24,
    gender: 'Male',
  };
}

async function listUsersFromJsonFallback() {
  try {
    const raw = await fs.readFile(usersJsonFallbackPath, 'utf8');
    const users = JSON.parse(raw);
    const withDoctor = users.some(user => user.id === 'doctor-default') ? users : [defaultDoctorUser(), ...users];
    return withDoctor.some(user => user.id === 'patient-sample') ? withDoctor : [defaultPatientUser(), ...withDoctor];
  } catch {
    return [defaultPatientUser(), defaultDoctorUser()];
  }
}

async function saveUsersToJsonFallback(users) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(usersJsonFallbackPath, JSON.stringify(users, null, 2));
}

async function runUserQuery(action, payload = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  const script = `
import json, sqlite3, sys
db, action, payload_raw = sys.argv[1], sys.argv[2], sys.argv[3]
payload = json.loads(payload_raw)
doctor = payload.get("doctor")
patient = payload.get("patient")
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
conn.execute("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, email TEXT UNIQUE, password_hash TEXT, abha_id TEXT UNIQUE, age INTEGER, gender TEXT)")
conn.execute("INSERT OR IGNORE INTO users (id, role, name, email, password_hash, abha_id, age, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (doctor["id"], doctor["role"], doctor["name"], doctor["email"], doctor["passwordHash"], doctor["abhaId"], doctor["age"], doctor["gender"]))
conn.execute("INSERT OR IGNORE INTO users (id, role, name, email, password_hash, abha_id, age, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (patient["id"], patient["role"], patient["name"], patient["email"], patient["passwordHash"], patient["abhaId"], patient["age"], patient["gender"]))
result = None
if action == "create":
    user = payload["user"]
    conn.execute("INSERT INTO users (id, role, name, email, password_hash, abha_id, age, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (user["id"], user["role"], user["name"], user.get("email", ""), user.get("passwordHash", ""), user.get("abhaId", ""), user.get("age", 0), user.get("gender", "")))
    result = user
elif action == "login_email":
    row = conn.execute("SELECT * FROM users WHERE role = ? AND lower(email) = lower(?) AND password_hash = ?", (payload["role"], payload["email"], payload["passwordHash"])).fetchone()
    result = dict(row) if row else None
elif action == "login_abha":
    row = conn.execute("SELECT * FROM users WHERE role = 'patient' AND abha_id = ?", (payload["abhaId"],)).fetchone()
    result = dict(row) if row else None
conn.commit()
conn.close()
print(json.dumps(result))
`;
  return JSON.parse(await runPython(script, [sqlitePath, action, JSON.stringify({ ...payload, doctor: defaultDoctorUser(), patient: defaultPatientUser() })]));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email || '',
    abhaId: user.abha_id || user.abhaId || '',
    age: Number(user.age || 0),
    gender: user.gender || '',
  };
}

async function createUser(userInput) {
  const user = {
    id: `user-${Date.now()}`,
    role: userInput.role,
    name: String(userInput.name || '').trim(),
    email: String(userInput.email || '').trim(),
    passwordHash: hashPassword(userInput.password),
    abhaId: String(userInput.abhaId || '').trim(),
    age: Number(userInput.age || 0),
    gender: String(userInput.gender || '').trim(),
  };

  try {
    return publicUser(await runUserQuery('create', { user }));
  } catch (error) {
    console.warn('[Server] SQLite user create unavailable; using JSON fallback:', error.message);
    const users = await listUsersFromJsonFallback();
    if (users.some(existing => user.email && existing.email?.toLowerCase() === user.email.toLowerCase())) {
      throw new Error('Email already exists.');
    }
    if (users.some(existing => user.abhaId && existing.abhaId === user.abhaId)) {
      throw new Error('ABHA ID already exists.');
    }
    await saveUsersToJsonFallback([user, ...users]);
    return publicUser(user);
  }
}

async function loginUser(loginInput) {
  const role = String(loginInput.role || '').trim();
  const email = String(loginInput.email || '').trim();
  const abhaId = String(loginInput.abhaId || '').trim();
  const passwordHash = hashPassword(loginInput.password);

  try {
    const user = abhaId
      ? await runUserQuery('login_abha', { abhaId })
      : await runUserQuery('login_email', { role, email, passwordHash });
    return publicUser(user);
  } catch (error) {
    console.warn('[Server] SQLite user login unavailable; using JSON fallback:', error.message);
    const users = await listUsersFromJsonFallback();
    const user = abhaId
      ? users.find(existing => existing.role === 'patient' && existing.abhaId === abhaId)
      : users.find(existing => existing.role === role && existing.email?.toLowerCase() === email.toLowerCase() && existing.passwordHash === passwordHash);
    return publicUser(user);
  }
}

// Helper to dismiss common onboarding/login popups in ChatGPT guest mode
async function dismissPopups(targetPage) {
  try {
    const buttons = await targetPage.$$('button');
    for (const btn of buttons) {
      const text = await targetPage.evaluate(el => el.innerText || '', btn);
      const lowerText = text.toLowerCase();
      if (
        lowerText.includes('stay logged out') || 
        lowerText.includes('dismiss') || 
        lowerText.includes('close') || 
        lowerText.includes('got it') ||
        lowerText.includes('okay') ||
        lowerText.includes('no thanks') ||
        lowerText.includes('maybe later') ||
        lowerText.includes('continue without')
      ) {
        await btn.click();
        console.log(`[Server] Dismissed ChatGPT popup button: "${text}"`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (e) {
    // Ignore error
  }
}

// Navigate to ChatGPT with retry logic
async function navigateToChatGPT(targetPage, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Server] Navigation attempt ${attempt}/${maxRetries}...`);
      await targetPage.goto('https://chatgpt.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      // Wait for the page to settle after initial load
      await new Promise(r => setTimeout(r, 3000));
      console.log(`[Server] Navigation succeeded on attempt ${attempt}.`);
      return true;
    } catch (err) {
      console.warn(`[Server] Navigation attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const backoff = attempt * 2000;
        console.log(`[Server] Retrying in ${backoff / 1000}s...`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  return false;
}

// Initialize Puppeteer Browser
async function initBrowser() {
  if (browser && page) {
    // Verify the page is still usable
    try {
      await page.title();
      return;
    } catch (e) {
      console.warn('[Server] Existing page is stale, reinitializing...');
      browser = null;
      page = null;
    }
  }

  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 500));
    }
    return;
  }

  isInitializing = true;
  console.log('[Server] Starting Puppeteer (stealth mode) Chromium instance...');
  
  try {
    browser = await puppeteerExtra.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ]
    });

    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    // Set a realistic user agent
    await page.setUserAgent(REALISTIC_USER_AGENT);

    // Remove the webdriver property that ChatGPT checks
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // Spoof plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      // Spoof languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
    
    console.log('[Server] Navigating to ChatGPT...');
    const success = await navigateToChatGPT(page);

    if (!success) {
      throw new Error('All navigation attempts to ChatGPT failed. ChatGPT may be blocking automated access or the site may be down.');
    }
    
    await dismissPopups(page);
    
    console.log('[Server] Browser automation environment ready.');
  } catch (error) {
    console.error('[Server] Failed to initialize browser:', error.message);
    // Clean up on failure so next attempt starts fresh
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
    browser = null;
    page = null;
  } finally {
    isInitializing = false;
  }
}

// Ensure browser is ready on start
initBrowser();

// Selector constants for robustness (supports both legacy desktop and mobile/guest mode DOM variations)
const TEXTAREA_SELECTOR = '#prompt-textarea, #mobile-composer-prompt, textarea[placeholder*="ChatGPT"], textarea[aria-label*="ChatGPT"], textarea[placeholder*="Ask"]';
const SEND_BUTTON_SELECTOR = 'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label*="Send"], button[aria-label*="Submit"]';
const ASSISTANT_MESSAGE_SELECTOR = 'div[class*="assistantMessage"]:not([class*="Actions"]), div[data-message-author-role="assistant"], div.agent-turn, div.markdown, div.prose, [data-testid*="assistant"]:not([class*="Actions"])';

// Upload a file (PDF/Image) as base64 and save it to data/uploads
app.post('/api/upload', async (req, res) => {
  const { filename, base64 } = req.body;
  if (!filename || !base64) {
    return res.status(400).json({ error: 'Filename and base64 content are required.' });
  }

  try {
    const uploadsDir = path.join(dataDir, 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Remove the data URL header if present
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const ext = path.extname(filename) || '.bin';
    const uniqueFilename = `${crypto.randomBytes(8).toString('hex')}-${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, uniqueFilename);

    await fs.writeFile(filePath, buffer);

    const fileUrl = `http://localhost:3001/uploads/${uniqueFilename}`;
    console.log(`[Server] File uploaded successfully: ${uniqueFilename}`);
    res.status(201).json({ url: fileUrl });
  } catch (error) {
    console.error('[Server] File upload failed:', error.message);
    res.status(500).json({ error: 'File upload failed.' });
  }
});

// Reset chat session (reloads ChatGPT to clear history for new patient)
app.post('/api/reset', async (req, res) => {
  console.log('[Server] Resetting chat session (reloading page)...');
  try {
    await initBrowser();
    const success = await navigateToChatGPT(page);
    if (!success) {
      throw new Error('Failed to reload ChatGPT during reset.');
    }
    await new Promise(r => setTimeout(r, 1500));
    await dismissPopups(page);
    sessionInitialized = false;
    res.json({ success: true, message: 'Chat session reset successfully.' });
  } catch (error) {
    console.error('[Server] Reset error:', error.message);
    res.status(500).json({ error: 'Failed to reset page.' });
  }
});

async function sendPromptAndReadJson(prompt, maxWaitSeconds = 60) {
  await initBrowser();
  await dismissPopups(page);

  console.log('[Server] Waiting for input composer...');
  await page.waitForSelector(TEXTAREA_SELECTOR, { timeout: 20000 });
  await page.focus(TEXTAREA_SELECTOR);

  await page.evaluate((text, selector) => {
    const textarea = document.querySelector(selector);
    if (textarea) {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, prompt, TEXTAREA_SELECTOR);

  await new Promise(r => setTimeout(r, 500));
  console.log('[Server] Locating send button...');
  await page.waitForSelector(SEND_BUTTON_SELECTOR, { timeout: 8000 });
  await page.click(SEND_BUTTON_SELECTOR);

  console.log('[Server] Prompt submitted. Waiting for output...');
  let isGenerating = true;
  let timeoutCounter = 0;

  while (isGenerating && timeoutCounter < maxWaitSeconds) {
    await new Promise(r => setTimeout(r, 1000));
    timeoutCounter++;

    const stopButton = await page.$('button[aria-label="Stop generating"], button[aria-label*="Stop"]');
    const sendButton = await page.$(SEND_BUTTON_SELECTOR);

    if (!stopButton && sendButton) {
      const isDisabled = await page.evaluate(el => el.disabled, sendButton);
      if (!isDisabled) {
        isGenerating = false;
      }
    }

    if (timeoutCounter % 5 === 0) {
      await dismissPopups(page);
    }
  }

  await page.waitForSelector(ASSISTANT_MESSAGE_SELECTOR, { timeout: 10000 });
  const messages = await page.$$(ASSISTANT_MESSAGE_SELECTOR);
  if (messages.length === 0) {
    throw new Error('No assistant responses found in DOM.');
  }

  const lastMessage = messages[messages.length - 1];
  const rawText = await page.evaluate(el => {
    const prose = el.querySelector('[class*="messageCopy"]') || el.querySelector('.prose') || el;
    return prose.innerText || '';
  }, lastMessage);

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const jsonString = jsonMatch ? jsonMatch[0] : rawText;

  try {
    return JSON.parse(jsonString.trim());
  } catch (parseError) {
    console.warn('[Server] Failed to parse scraped response as JSON. Sending raw text:', rawText);
    return { rawResponse: rawText };
  }
}

app.post('/api/session/start', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  console.log('[Server] Starting one-time interview session setup...');
  try {
    const parsed = await sendPromptAndReadJson(prompt, 60);
    sessionInitialized = true;
    res.json(parsed);
  } catch (error) {
    console.error('[Server] Session setup error:', error);
    res.status(500).json({ error: error.message || 'Session setup failed.' });
  }
});

app.get('/api/tts', async (req, res) => {
  const text = String(req.query.text || '').trim();
  const lang = String(req.query.lang || 'hi').trim();

  if (!text) {
    return res.status(400).json({ error: 'Text is required.' });
  }

  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('tl', lang);
  url.searchParams.set('q', text.slice(0, 190));

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': REALISTIC_USER_AGENT,
        'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        'Referer': 'https://translate.google.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`Google TTS status ${response.status}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audioBuffer);
  } catch (error) {
    console.error('[Server] Google TTS proxy failed:', error.message);
    res.status(502).json({ error: error.message || 'Google TTS failed.' });
  }
});

app.post('/api/translate', async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) {
    return res.json({ translatedText: '' });
  }

  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', 'en');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text.slice(0, 4500));

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': REALISTIC_USER_AGENT,
        'Accept': 'application/json,text/plain,*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Google Translate status ${response.status}`);
    }

    const data = await response.json();
    const translatedText = Array.isArray(data?.[0])
      ? data[0].map(part => part?.[0] || '').join('')
      : text;
    res.json({ translatedText });
  } catch (error) {
    console.error('[Server] Google Translate proxy failed:', error.message);
    res.status(502).json({ error: error.message || 'Translation failed.' });
  }
});

app.get('/api/patients', async (req, res) => {
  try {
    res.json({ patients: await listPatients() });
  } catch (error) {
    console.error('[Server] Patient list failed:', error.message);
    res.status(500).json({ error: error.message || 'Patient list failed.' });
  }
});

app.post('/api/patients', async (req, res) => {
  const patient = req.body.patient;
  if (!patient?.id) {
    return res.status(400).json({ error: 'Patient record with id is required.' });
  }

  try {
    res.status(201).json({ patient: await savePatient(patient) });
  } catch (error) {
    console.error('[Server] Patient save failed:', error.message);
    res.status(500).json({ error: error.message || 'Patient save failed.' });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    await deletePatient(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Server] Patient delete failed:', error.message);
    res.status(500).json({ error: error.message || 'Patient delete failed.' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, abhaId, age, gender } = req.body;
  if (!name || !email || !password || !abhaId) {
    return res.status(400).json({ error: 'Name, email, password, and ABHA ID are required.' });
  }

  try {
    const user = await createUser({
      role: 'patient',
      name,
      email,
      password,
      abhaId,
      age,
      gender,
    });
    res.status(201).json({ user });
  } catch (error) {
    console.error('[Server] Signup failed:', error.message);
    res.status(400).json({ error: error.message || 'Signup failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { role, email, password, abhaId } = req.body;
  if (role === 'patient' && abhaId) {
    const user = await loginUser({ role, abhaId });
    if (user) return res.json({ user });
    return res.status(401).json({ error: 'No patient found for this ABHA ID.' });
  }

  if (!role || !email || !password) {
    return res.status(400).json({ error: 'Role, email, and password are required.' });
  }

  const user = await loginUser({ role, email, password });
  if (!user) {
    return res.status(401).json({ error: 'Invalid login details.' });
  }
  res.json({ user });
});

// Chat automation endpoint
app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  console.log('[Server] Processing conversation turn...');
  try {
    if (!sessionInitialized) {
      console.warn('[Server] Chat turn received before session setup; continuing with compact prompt only.');
    }
    const parsedJson = await sendPromptAndReadJson(prompt, 60);
    console.log('[Server] Successfully scraped response from browser.');
    res.json(parsedJson);

  } catch (error) {
    console.error('[Server] Automation error:', error);
    res.status(500).json({ error: error.message || 'Automation failed.' });
  }
});

// Summary generation endpoint
app.post('/api/summary', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  console.log('[Server] Automating summary generation...');
  try {
    await initBrowser();
    await dismissPopups(page);

    console.log('[Server] Waiting for input composer...');
    await page.waitForSelector(TEXTAREA_SELECTOR, { timeout: 20000 });
    await page.focus(TEXTAREA_SELECTOR);

    await page.evaluate((text, selector) => {
      const textarea = document.querySelector(selector);
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, prompt, TEXTAREA_SELECTOR);

    await new Promise(r => setTimeout(r, 500));
    await page.waitForSelector(SEND_BUTTON_SELECTOR, { timeout: 8000 });
    await page.click(SEND_BUTTON_SELECTOR);

    let isGenerating = true;
    let timeoutCounter = 0;

    while (isGenerating && timeoutCounter < 60) {
      await new Promise(r => setTimeout(r, 1000));
      timeoutCounter++;
      const stopButton = await page.$('button[aria-label="Stop generating"], button[aria-label*="Stop"]');
      const sendButton = await page.$(SEND_BUTTON_SELECTOR);

      if (!stopButton && sendButton) {
        const isDisabled = await page.evaluate(el => el.disabled, sendButton);
        if (!isDisabled) {
          isGenerating = false;
        }
      }
    }

    await page.waitForSelector(ASSISTANT_MESSAGE_SELECTOR, { timeout: 10000 });
    
    const messages = await page.$$(ASSISTANT_MESSAGE_SELECTOR);
    const lastMessage = messages[messages.length - 1];
    
    const rawText = await page.evaluate(el => {
      const prose = el.querySelector('[class*="messageCopy"]') || el.querySelector('.prose') || el;
      return prose.innerText || '';
    }, lastMessage);

    res.json({ summaryText: rawText });
  } catch (error) {
    console.error('[Server] Summary automation failed:', error);
    res.status(500).json({ error: error.message || 'Automation failed.' });
  }
});

// Close browser gracefully on exit
process.on('SIGINT', async () => {
  console.log('[Server] Closing browser...');
  if (browser) {
    await browser.close();
  }
  process.exit();
});

app.listen(port, () => {
  console.log(`[Server] Proxy automation server listening at http://localhost:${port}`);
});
