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
): Promise<unknown[]> {
  const cachePath = ensureCacheDir(cacheFile);

  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  }

  console.log(`Downloading ${repoId} split=${split} (up to ${limit} rows)...`);

  // Try parquet download first (more reliable than the rows API)
  try {
    const rows = await downloadViaParquet(repoId, split, limit, columns);
    writeFileSync(cachePath, JSON.stringify(rows, null, 2));
    console.log(`Cached ${rows.length} rows to ${cachePath}`);
    return rows;
  } catch (err) {
    console.warn(`  Parquet download failed: ${err instanceof Error ? err.message : err}`);
    console.log('  Falling back to rows API...');
  }

  // Fallback: paginated rows API with retries
  const rows = await downloadViaRowsAPI(repoId, split, limit);
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
): Promise<Record<string, string>[]> {
  // First, discover parquet file URLs for this split
  const infoUrl = `https://datasets-server.huggingface.co/parquet?dataset=${encodeURIComponent(repoId)}`;
  const infoResp = await fetch(infoUrl);
  if (!infoResp.ok) throw new Error(`Parquet info API returned ${infoResp.status}`);

  const info = await infoResp.json() as { parquet_files: Array<{ split: string; url: string }> };
  const parquetFiles = info.parquet_files.filter((f) => f.split === split);
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
): Promise<unknown[]> {
  const allRows: unknown[] = [];
  let offset = 0;

  while (allRows.length < limit) {
    const pageSize = Math.min(HF_PAGE_SIZE, limit - allRows.length);
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(repoId)}&config=default&split=${split}&offset=${offset}&length=${pageSize}`;

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
