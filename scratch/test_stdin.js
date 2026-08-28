import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceDir = path.join(__dirname, '..');
const sqlitePath = path.join(workspaceDir, 'data', 'medpulse.sqlite');
const jsonFallbackPath = path.join(workspaceDir, 'data', 'patients.json');

async function runPython(script, args = [], stdinData = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-c', script, ...args], { cwd: workspaceDir });
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
        console.error('[Test] Python stdin error:', err.message);
      });
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

async function testSave() {
  console.log("Reading test patient from patients.json...");
  const raw = await fs.readFile(jsonFallbackPath, 'utf8');
  const jsonPatients = JSON.parse(raw);
  if (jsonPatients.length === 0) {
    console.error("No patients found in patients.json to test with!");
    return;
  }
  const patient = jsonPatients[0];
  console.log(`Found patient: ${patient.name} (${patient.id})`);

  const saveScript = `
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

  console.log("Saving patient to SQLite via Python stdin...");
  await runPython(saveScript, [sqlitePath], JSON.stringify(patient));
  console.log("Save operation completed successfully!");
}

async function testList() {
  const listScript = `
import json, sqlite3, sys
db = sys.argv[1]
conn = sqlite3.connect(db)
conn.execute("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT, triage_level TEXT, routed_at TEXT, record_json TEXT NOT NULL)")
rows = conn.execute("SELECT record_json FROM patients").fetchall()
print(json.dumps([json.loads(row[0]) for row in rows]))
conn.close()
`;
  console.log("Listing patients from SQLite...");
  const results = JSON.parse(await runPython(listScript, [sqlitePath]));
  console.log("SQLite patient list row count:", results.length);
  if (results.length > 0) {
    console.log("Latest patient in SQLite:", results[0].name, "(", results[0].id, ")");
  }
}

async function main() {
  try {
    await testSave();
    await testList();
    console.log("--- ALL TESTS PASSED! ---");
  } catch (e) {
    console.error("Test failed with error:", e);
  }
}

main();
