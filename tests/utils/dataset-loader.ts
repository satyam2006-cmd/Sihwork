import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

interface SOAPSample {
  dialogue: string;
  soap: string;
}

interface DialogSample {
  id: string;
  patient_messages: string[];
  doctor_messages: string[];
}

const HF_PAGE_SIZE = 100; // HuggingFace rows API max per request
const HF_MAX_RETRIES = 3;
const HF_RETRY_DELAY_MS = 2000;

/** Ensure cache directory exists and return the full cache path. */
function ensureCacheDir(cacheFile: string): string {
  const cachePath = join(FIXTURES_DIR, cacheFile);
  const dir = join(FIXTURES_DIR, cacheFile.split('/')[0]);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return cachePath;
}

/**
 * Download a HuggingFace dataset via parquet file (primary, more reliable)
 * then fall back to the rows API if parquet fails.
 * Caches locally in fixtures/ to avoid repeated downloads.
 */
async function downloadHFDataset(
  repoId: string,
  split: string,
  cacheFile: string,
  limit: number = 100,
  columns?: string[],
  config?: string,
): Promise<unknown[]> {
  const cachePath = ensureCacheDir(cacheFile);

  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  }

  console.log(`Downloading ${repoId} split=${split} (up to ${limit} rows)...`);

  // Try parquet download first (more reliable than the rows API)
  try {
    const rows = await downloadViaParquet(repoId, split, limit, columns, config);
    writeFileSync(cachePath, JSON.stringify(rows, null, 2));
    console.log(`Cached ${rows.length} rows to ${cachePath}`);
    return rows;
  } catch (err) {
    console.warn(`  Parquet download failed: ${err instanceof Error ? err.message : err}`);
    console.log('  Falling back to rows API...');
  }

  // Fallback: paginated rows API with retries
  const rows = await downloadViaRowsAPI(repoId, split, limit, config);
  writeFileSync(cachePath, JSON.stringify(rows, null, 2));
  console.log(`Cached ${rows.length} rows to ${cachePath}`);
  return rows;
}

/**
 * Download dataset by fetching the parquet file directly from HuggingFace Hub
 * and parsing it with hyparquet. Much more reliable than the rows API.
 */
async function downloadViaParquet(
  repoId: string,
  split: string,
  limit: number,
  columns?: string[],
  config?: string,
): Promise<Record<string, string>[]> {
  // First, discover parquet file URLs for this split
  const infoUrl = `https://datasets-server.huggingface.co/parquet?dataset=${encodeURIComponent(repoId)}`;
  const infoResp = await fetch(infoUrl);
  if (!infoResp.ok) throw new Error(`Parquet info API returned ${infoResp.status}`);

  const info = await infoResp.json() as { parquet_files: Array<{ split: string; config: string; url: string }> };
  const parquetFiles = info.parquet_files.filter((f) =>
    f.split === split && (!config || f.config === config)
  );
  if (parquetFiles.length === 0) throw new Error(`No parquet files found for split=${split}`);

  const { parquetRead } = await import('hyparquet');
  const allRows: Record<string, string>[] = [];

  for (const pf of parquetFiles) {
    if (allRows.length >= limit) break;

    console.log(`  Fetching parquet: ${pf.url.split('/').pop()}...`);
    const resp = await fetch(pf.url);
    if (!resp.ok) throw new Error(`Parquet file download returned ${resp.status}`);

    const buf = await resp.arrayBuffer();
    const fileObj = { byteLength: buf.byteLength, slice: (start: number, end: number) => buf.slice(start, end) };

    await parquetRead({
      file: fileObj,
      columns,
      onComplete: (data: unknown[][]) => {
        for (const row of data) {
          if (allRows.length >= limit) break;
          // hyparquet returns arrays when columns are specified
          if (columns && Array.isArray(row)) {
            const obj: Record<string, string> = {};
            columns.forEach((col, i) => { obj[col] = String(row[i] ?? ''); });
            allRows.push(obj);
          } else {
            allRows.push(row as unknown as Record<string, string>);
          }
        }
      },
    });
  }

  console.log(`  Parsed ${allRows.length} rows from parquet`);
  return allRows;
}

/**
 * Fallback: download via the HuggingFace datasets server rows API.
 * Paginates automatically and retries on transient errors.
 */
async function downloadViaRowsAPI(
  repoId: string,
  split: string,
  limit: number,
  config?: string,
): Promise<unknown[]> {
  const allRows: unknown[] = [];
  let offset = 0;

  while (allRows.length < limit) {
    const pageSize = Math.min(HF_PAGE_SIZE, limit - allRows.length);
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(repoId)}&config=${config || 'default'}&split=${split}&offset=${offset}&length=${pageSize}`;

    let lastError: Error | null = null;
    let rows: unknown[] | null = null;

    for (let attempt = 0; attempt < HF_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log(`  Retry ${attempt}/${HF_MAX_RETRIES} for offset=${offset}...`);
        await new Promise(r => setTimeout(r, HF_RETRY_DELAY_MS * attempt));
      }
      try {
        const response = await fetch(url);
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
          continue;
        }
        const data = await response.json() as { rows: Array<{ row: unknown }> };
        rows = data.rows.map((r: { row: unknown }) => r.row);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!rows) {
      if (allRows.length > 0) {
        console.warn(`  Partial download: got ${allRows.length} rows before error at offset=${offset}: ${lastError?.message}`);
        break;
      }
      throw new Error(`Failed to fetch ${repoId}: ${lastError?.message}`);
    }

    allRows.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

/**
 * Load SOAP note samples from HuggingFace.
 * @param split - 'train' or 'test' (test has 250 harder held-out samples)
 */
export async function loadSOAPSamples(
  limit: number = 100,
  split: 'train' | 'validation' | 'test' = 'train',
): Promise<SOAPSample[]> {
  const rows = await downloadHFDataset(
    'omi-health/medical-dialogue-to-soap-summary',
    split,
    `soap-samples/soap-dataset-${split}.json`,
    limit,
    ['dialogue', 'soap'],
  );

  return rows.map((row: unknown) => {
    const r = row as Record<string, string>;
    return {
      dialogue: r.dialogue || r.input || '',
      soap: r.soap || r.output || r.target || '',
    };
  });
}

/**
 * Load medical dialog samples from HuggingFace.
 */
export async function loadDialogSamples(limit: number = 100): Promise<DialogSample[]> {
  const rows = await downloadHFDataset(
    'UCSD26/medical_dialog',
    'train',
    'dialog-samples/dialog-dataset.json',
    limit,
  );

  return rows.map((row: unknown, index: number) => {
    const r = row as Record<string, unknown>;
    // The dataset format may vary; handle common structures
    const utterances = (r.utterances as string[]) || [];
    const patient_messages: string[] = [];
    const doctor_messages: string[] = [];

    if (utterances.length > 0) {
      for (let i = 0; i < utterances.length; i++) {
        if (i % 2 === 0) patient_messages.push(utterances[i]);
        else doctor_messages.push(utterances[i]);
      }
    } else if (typeof r.input === 'string' && typeof r.output === 'string') {
      patient_messages.push(r.input);
      doctor_messages.push(r.output);
    }

    return {
      id: `dialog-${index}`,
      patient_messages,
      doctor_messages,
    };
  });
}

/**
 * Generate a synthetic patient record for testing.
 */
export function generateSyntheticPatient(complexity: 'simple' | 'moderate' | 'complex' | 'edge') {
  const base = {
    full_name: `Test Patient ${Math.random().toString(36).slice(2, 8)}`,
    date_of_birth: '1985-03-15',
    gender: 'Female',
    blood_type: 'O+',
    allergies: [] as string[],
    chronic_conditions: [] as string[],
    current_medications: [] as string[],
  };

  const documents: Array<{
    file_name: string;
    extracted_data: Record<string, unknown>;
    extracted_summary: string;
    uploaded_at: string;
  }> = [];

  switch (complexity) {
    case 'simple':
      base.allergies = ['Penicillin'];
      base.chronic_conditions = ['Mild asthma'];
      documents.push({
        file_name: 'blood-test-2024.pdf',
        extracted_data: { hemoglobin: '13.5 g/dL', wbc: '7,500/μL', platelets: '250,000/μL' },
        extracted_summary: 'Complete blood count within normal ranges. Hemoglobin 13.5, WBC 7,500, platelets 250,000.',
        uploaded_at: '2024-06-15T10:00:00Z',
      });
      break;

    case 'moderate':
      base.allergies = ['Penicillin', 'Sulfa drugs'];
      base.chronic_conditions = ['Type 2 Diabetes', 'Hypertension', 'Mild depression'];
      base.current_medications = ['Metformin 500mg', 'Lisinopril 10mg', 'Sertraline 50mg'];
      for (let i = 0; i < 5; i++) {
        documents.push({
          file_name: `report-${i}.pdf`,
          extracted_data: { test: `value-${i}`, date: `2024-0${i + 1}-15` },
          extracted_summary: `Medical report ${i + 1} with test results from ${2024}. Key values within expected ranges for patient with diabetes and hypertension.`,
          uploaded_at: `2024-0${i + 1}-15T10:00:00Z`,
        });
      }
      break;

    case 'complex':
      base.allergies = ['Penicillin', 'Sulfa drugs', 'Latex', 'Codeine'];
      base.chronic_conditions = ['Type 2 Diabetes', 'Hypertension', 'COPD', 'Chronic kidney disease stage 3', 'Atrial fibrillation', 'Osteoarthritis'];
      base.current_medications = ['Metformin 1000mg', 'Lisinopril 20mg', 'Warfarin 5mg', 'Tiotropium inhaler', 'Gabapentin 300mg', 'Atorvastatin 40mg'];
      for (let i = 0; i < 15; i++) {
        documents.push({
          file_name: `document-${i}.pdf`,
          extracted_data: generateFakeExtraction(i),
          extracted_summary: `Medical document ${i + 1} from ${2023 + Math.floor(i / 6)}. Contains ${i % 2 === 0 ? 'lab results' : 'imaging report'} relevant to ongoing management of multiple chronic conditions.`,
          uploaded_at: new Date(2023, i % 12, 15).toISOString(),
        });
      }
      break;

    case 'edge':
      base.full_name = 'Elderly Test Patient';
      base.date_of_birth = '1940-01-01';
      base.gender = 'Male';
      base.allergies = ['Penicillin', 'Sulfa drugs', 'Latex', 'Codeine', 'NSAIDs', 'Aspirin'];
      base.chronic_conditions = [
        'Type 2 Diabetes', 'Hypertension', 'COPD', 'CHF NYHA Class III',
        'Chronic kidney disease stage 4', 'Atrial fibrillation', 'Osteoarthritis',
        'Peripheral neuropathy', 'Macular degeneration', 'BPH',
      ];
      base.current_medications = [
        'Metformin 1000mg', 'Insulin glargine 20u', 'Lisinopril 40mg', 'Amlodipine 10mg',
        'Warfarin 7.5mg', 'Tiotropium inhaler', 'Furosemide 40mg', 'Carvedilol 25mg',
        'Gabapentin 600mg', 'Atorvastatin 80mg', 'Tamsulosin 0.4mg', 'Omeprazole 20mg',
      ];
      for (let i = 0; i < 25; i++) {
        documents.push({
          file_name: `elderly-doc-${i}.pdf`,
          extracted_data: generateFakeExtraction(i),
          extracted_summary: `Document ${i + 1}: ${i % 3 === 0 ? 'Cardiology follow-up' : i % 3 === 1 ? 'Nephrology labs' : 'Primary care visit notes'}. Complex polypharmacy patient with multiple comorbidities requiring careful medication management.`,
          uploaded_at: new Date(2022, i % 12, 15).toISOString(),
        });
      }
      break;
  }

  return { patient: base, documents };
}

// ---------------------------------------------------------------------------
// MedXpertQA loading
// ---------------------------------------------------------------------------

export interface MedXpertQASample {
  id: string;
  question: string;
  options: Record<string, string>;
  label: string;
  medical_task: string;
  body_system: string;
  question_type: string;
}

/**
 * Load MedXpertQA Text-only samples from HuggingFace.
 * Dataset: TsinghuaC3I/MedXpertQA, config: Text, split: test
 * 2,460 expert-level 10-option MCQ questions across 17 specialties.
 */
export async function loadMedXpertQA(): Promise<MedXpertQASample[]> {
  // Don't pass columns — the `options` field is a dict/struct that gets
  // mangled by hyparquet's String() coercion when columns are specified
  const rows = await downloadHFDataset(
    'TsinghuaC3I/MedXpertQA',
    'test',
    'medxpertqa/medxpertqa-test.json',
    10_000,      // well above dataset size — download all
    undefined,   // no column filtering
    'Text',      // HF dataset config
  );

  return rows.map((row: unknown, index: number) => {
    const r = row as Record<string, unknown>;

    // hyparquet may return positional keys (0,1,2,...) instead of column names
    // Column order: 0=id, 1=question, 2=options, 3=label, 4=medical_task, 5=body_system, 6=question_type
    const hasNamedKeys = 'question' in r || 'id' in r;
    const rawId = hasNamedKeys ? r.id : r['0'];
    const rawQuestion = hasNamedKeys ? r.question : r['1'];
    const rawOptions = hasNamedKeys ? r.options : r['2'];
    const rawLabel = hasNamedKeys ? r.label : r['3'];
    const rawMedicalTask = hasNamedKeys ? r.medical_task : r['4'];
    const rawBodySystem = hasNamedKeys ? r.body_system : r['5'];
    const rawQuestionType = hasNamedKeys ? r.question_type : r['6'];

    // Handle options being either a parsed object or a JSON string
    let options: Record<string, string>;
    if (typeof rawOptions === 'string') {
      try {
        options = JSON.parse(rawOptions);
      } catch {
        options = {};
      }
    } else if (rawOptions && typeof rawOptions === 'object') {
      options = rawOptions as Record<string, string>;
    } else {
      options = {};
    }

    return {
      id: (rawId as string) || `Text-${index}`,
      question: (rawQuestion as string) || '',
      options,
      label: (rawLabel as string) || '',
      medical_task: (rawMedicalTask as string) || '',
      body_system: (rawBodySystem as string) || '',
      question_type: (rawQuestionType as string) || '',
    };
  });
}

// ---------------------------------------------------------------------------
// MedAgentBench task loading
// ---------------------------------------------------------------------------

const MEDAGENTBENCH_GITHUB_BASE = 'https://raw.githubusercontent.com/stanfordmlgroup/MedAgentBench/main/data/';
const MEDAGENTBENCH_CACHE_DIR = 'medagentbench';

interface MedAgentRawTask {
  task_id: string;
  patient_id: string;
  instruction: string;
  context?: string;
  sol: string[];
}

/**
 * Load MedAgentBench tasks from GitHub (cached locally).
 * Downloads test_data_v2.json (300 tasks, 30 per category).
 */
export async function loadMedAgentBenchTasks(): Promise<MedAgentRawTask[]> {
  const cacheDir = join(FIXTURES_DIR, MEDAGENTBENCH_CACHE_DIR);
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

  const cachePath = join(cacheDir, 'test_data_v2.json');

  if (existsSync(cachePath)) {
    const raw = JSON.parse(readFileSync(cachePath, 'utf-8'));
    return normalizeMedAgentTasks(raw);
  }

  console.log('  Downloading MedAgentBench test_data_v2.json...');
  const url = MEDAGENTBENCH_GITHUB_BASE + 'test_data_v2.json';

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      console.log(`  Retry ${attempt}/3...`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) {
        lastError = new Error(`HTTP ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      writeFileSync(cachePath, JSON.stringify(data, null, 2));
      console.log(`  Cached MedAgentBench tasks to ${cachePath}`);
      return normalizeMedAgentTasks(data);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`Failed to download MedAgentBench tasks: ${lastError?.message}`);
}

/** Normalize raw task data to consistent format. */
function normalizeMedAgentTasks(data: unknown): MedAgentRawTask[] {
  // Data may be an array of tasks or an object with a tasks key
  let tasks: unknown[];
  if (Array.isArray(data)) {
    tasks = data;
  } else if (data && typeof data === 'object' && 'tasks' in data) {
    tasks = (data as { tasks: unknown[] }).tasks;
  } else {
    // Might be a dict keyed by task ID
    tasks = Object.values(data as Record<string, unknown>);
  }

  return tasks.map((t: unknown) => {
    const raw = t as Record<string, unknown>;
    const taskId = (raw.task_id || raw.id || '') as string;
    const patientId = (raw.patient_id || raw.patientId || '') as string;
    const instruction = (raw.instruction || raw.prompt || raw.question || '') as string;
    const context = (raw.context || '') as string;

    // sol can be string, string[], or absent
    let sol: string[];
    if (Array.isArray(raw.sol)) {
      sol = raw.sol.map(String);
    } else if (typeof raw.sol === 'string') {
      sol = raw.sol ? [raw.sol] : [];
    } else if (raw.solution !== undefined) {
      sol = Array.isArray(raw.solution) ? raw.solution.map(String) : [String(raw.solution)];
    } else {
      sol = [];
    }

    return { task_id: taskId, patient_id: patientId, instruction, context: context || undefined, sol };
  });
}

// ---------------------------------------------------------------------------
// ACI-BENCH loading
// ---------------------------------------------------------------------------

export interface ACIBenchSample {
  id: string;        // from `file` field
  dialogue: string;  // from `src` field — [doctor]/[patient] tagged lines
  reference: string; // from `tgt` field — reference structured note
}

/**
 * Load ACI-BENCH samples from HuggingFace.
 * Dataset: mkieffer/ACI-Bench, CC BY 4.0
 * 207 total samples across test1+test2+test3 (120 test samples).
 */
export async function loadACIBench(
  splits: string[] = ['test1', 'test2', 'test3'],
): Promise<ACIBenchSample[]> {
  const allSamples: ACIBenchSample[] = [];

  for (const split of splits) {
    // Don't pass columns — hyparquet's String() coercion mangles large text
    // fields when columns are specified (same issue as MedXpertQA)
    const rows = await downloadHFDataset(
      'mkieffer/ACI-Bench',
      split,
      `aci-bench/aci-bench-${split}.json`,
      10_000,
    );

    const samples = rows.map((row: unknown, index: number) => {
      const r = row as Record<string, unknown>;

      // hyparquet may return arrays or positional keys instead of column names
      // Column order: 0=file, 1=src, 2=tgt
      const isArray = Array.isArray(row);
      const hasNamedKeys = !isArray && ('src' in r || 'tgt' in r);
      const rawFile = hasNamedKeys ? r.file : isArray ? (row as unknown[])[0] : r['0'];
      const rawSrc = hasNamedKeys ? r.src : isArray ? (row as unknown[])[1] : r['1'];
      const rawTgt = hasNamedKeys ? r.tgt : isArray ? (row as unknown[])[2] : r['2'];

      return {
        id: String(rawFile || `sample-${index}`),
        dialogue: String(rawSrc || ''),
        reference: String(rawTgt || ''),
      };
    });

    allSamples.push(...samples);
  }

  return allSamples;
}

// ---------------------------------------------------------------------------
// Synthetic patient generation
// ---------------------------------------------------------------------------

function generateFakeExtraction(seed: number): Record<string, unknown> {
  const types = ['lab_results', 'imaging', 'prescription', 'discharge_summary'];
  const type = types[seed % types.length];
  const data: Record<string, unknown> = { document_type: type };

  switch (type) {
    case 'lab_results':
      data.tests = [
        { name: 'HbA1c', value: `${(6 + seed * 0.2).toFixed(1)}%`, reference: '4.0-5.6%' },
        { name: 'Creatinine', value: `${(0.8 + seed * 0.1).toFixed(1)} mg/dL`, reference: '0.7-1.3 mg/dL' },
        { name: 'eGFR', value: `${Math.max(30, 90 - seed * 3)} mL/min`, reference: '>60 mL/min' },
      ];
      break;
    case 'imaging':
      data.findings = `Imaging study ${seed}: No acute findings. Chronic changes consistent with known conditions.`;
      data.impression = 'Stable compared to prior studies.';
      break;
    case 'prescription':
      data.medications = [{ name: 'Metformin', dose: '1000mg', frequency: 'twice daily' }];
      break;
    case 'discharge_summary':
      data.admission_reason = 'Acute exacerbation of COPD';
      data.hospital_course = 'Patient treated with nebulizers and steroids. Improved over 3 days.';
      data.discharge_medications = ['Prednisone taper', 'Albuterol PRN'];
      break;
  }

  return data;
}
