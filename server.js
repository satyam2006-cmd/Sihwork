import express from 'express';
import cors from 'cors';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Enable stealth mode to bypass ChatGPT's bot detection
puppeteerExtra.use(StealthPlugin());

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

let browser = null;
let page = null;
let isInitializing = false;

const REALISTIC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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
      headless: false, // Set to false so the user can visually see it running in the background for the Hackathon!
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
    res.json({ success: true, message: 'Chat session reset successfully.' });
  } catch (error) {
    console.error('[Server] Reset error:', error.message);
    res.status(500).json({ error: 'Failed to reset page.' });
  }
});

// Chat automation endpoint
app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  console.log('[Server] Processing conversation turn...');
  try {
    await initBrowser();
    await dismissPopups(page);

    // Wait for the text input area
    console.log('[Server] Waiting for input composer...');
    await page.waitForSelector(TEXTAREA_SELECTOR, { timeout: 20000 });
    
    // Focus and type the prompt
    await page.focus(TEXTAREA_SELECTOR);
    
    // Use page.evaluate to set text directly (faster and safer for long prompts)
    await page.evaluate((text, selector) => {
      const textarea = document.querySelector(selector);
      if (textarea) {
        textarea.value = text;
        // Trigger input event so React/Vue on ChatGPT knows it changed
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, prompt, TEXTAREA_SELECTOR);

    await new Promise(r => setTimeout(r, 500));

    // Click the send button
    console.log('[Server] Locating send button...');
    await page.waitForSelector(SEND_BUTTON_SELECTOR, { timeout: 8000 });
    await page.click(SEND_BUTTON_SELECTOR);

    console.log('[Server] Prompt submitted. Waiting for ChatGPT streaming output...');

    // Polling mechanism to wait for ChatGPT to finish generating
    let isGenerating = true;
    let timeoutCounter = 0;
    const maxWaitSeconds = 60; // 1 minute max timeout

    while (isGenerating && timeoutCounter < maxWaitSeconds) {
      await new Promise(r => setTimeout(r, 1000));
      timeoutCounter++;

      // Check if Stop/Pause button is active (generating is in progress)
      const stopButton = await page.$('button[aria-label="Stop generating"], button[aria-label*="Stop"]');
      const sendButton = await page.$(SEND_BUTTON_SELECTOR);

      if (!stopButton && sendButton) {
        // Double check if send button is no longer disabled
        const isDisabled = await page.evaluate(el => el.disabled, sendButton);
        if (!isDisabled) {
          isGenerating = false;
        }
      }
      
      // Periodically dismiss popups if they block the view
      if (timeoutCounter % 5 === 0) {
        await dismissPopups(page);
      }
    }

    console.log('[Server] Generation finished. Fetching response...');

    // Extract the last assistant response prose
    await page.waitForSelector(ASSISTANT_MESSAGE_SELECTOR, { timeout: 10000 });
    
    const messages = await page.$$(ASSISTANT_MESSAGE_SELECTOR);
    if (messages.length === 0) {
      throw new Error('No assistant responses found in DOM.');
    }

    const lastMessage = messages[messages.length - 1];
    
    // Extract the inner text of the prose response
    const rawText = await page.evaluate(el => {
      // Find the message block prose/copy element
      const prose = el.querySelector('[class*="messageCopy"]') || el.querySelector('.prose') || el;
      return prose.innerText || '';
    }, lastMessage);

    console.log('[Server] Successfully scraped response from browser.');
    
    // Parse JSON block out of response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawText;

    try {
      const parsedJson = JSON.parse(jsonString.trim());
      res.json(parsedJson);
    } catch (parseError) {
      console.warn('[Server] Failed to parse scraped response as JSON. Sending raw text:', rawText);
      res.json({ rawResponse: rawText });
    }

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
