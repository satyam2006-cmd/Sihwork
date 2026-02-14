/**
 * Seed Synthea
 *
 * Generates synthetic patients of varying complexity and writes them
 * to fixtures/ for use by stress tests. Also can seed them into a
 * Supabase database if SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are set.
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { generateSyntheticPatient } from './utils/dataset-loader';

const FIXTURES_DIR = join(__dirname, 'fixtures', 'synthea');

interface SyntheticPatientSet {
  simple: ReturnType<typeof generateSyntheticPatient>[];
  moderate: ReturnType<typeof generateSyntheticPatient>[];
  complex: ReturnType<typeof generateSyntheticPatient>[];
  edge: ReturnType<typeof generateSyntheticPatient>[];
}

function generatePatientSet(): SyntheticPatientSet {
  console.log('Generating synthetic patients...');

  const set: SyntheticPatientSet = {
    simple: [],
    moderate: [],
    complex: [],
    edge: [],
  };

  for (let i = 0; i < 20; i++) set.simple.push(generateSyntheticPatient('simple'));
  for (let i = 0; i < 40; i++) set.moderate.push(generateSyntheticPatient('moderate'));
  for (let i = 0; i < 20; i++) set.complex.push(generateSyntheticPatient('complex'));
  for (let i = 0; i < 20; i++) set.edge.push(generateSyntheticPatient('edge'));

  console.log(`Generated: ${set.simple.length} simple, ${set.moderate.length} moderate, ${set.complex.length} complex, ${set.edge.length} edge`);

  return set;
}

async function seedToDatabase(patients: SyntheticPatientSet) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Skipping DB seed (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set)');
    return;
  }

  // Dynamic import to avoid requiring supabase when just generating fixtures
  const { createServiceClient } = await import('@second-opinion/shared');
  const supabase = createServiceClient();

  const allPatients = [
    ...patients.simple,
    ...patients.moderate,
    ...patients.complex,
    ...patients.edge,
  ];

  console.log(`\nSeeding ${allPatients.length} patients to database...`);

  let seeded = 0;
  for (const p of allPatients) {
    // Create a test user first — skip if auth is not configured for testing
    try {
      const { data: patient, error } = await supabase
        .from('patients')
        .insert({
          // Use a placeholder user_id since we can't create auth users via service client
          user_id: '00000000-0000-0000-0000-000000000000',
          ...p.patient,
        })
        .select('id')
        .single();

      if (error) {
        console.error(`  Failed to seed patient: ${error.message}`);
        continue;
      }

      // Seed documents
      for (const doc of p.documents) {
        await supabase.from('documents').insert({
          patient_id: patient.id,
          file_name: doc.file_name,
          file_path: `test/${doc.file_name}`,
          file_size: 1024,
          mime_type: 'application/pdf',
          status: 'processed',
          extracted_data: doc.extracted_data,
          extracted_summary: doc.extracted_summary,
          uploaded_at: doc.uploaded_at,
        });
      }

      seeded++;
    } catch (err) {
      console.error(`  Error seeding: ${err}`);
    }
  }

  console.log(`Seeded ${seeded}/${allPatients.length} patients to database`);
}

async function main() {
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const patients = generatePatientSet();

  // Write to fixtures
  writeFileSync(
    join(FIXTURES_DIR, 'patients.json'),
    JSON.stringify(patients, null, 2),
  );
  console.log(`\nWrote fixtures to ${FIXTURES_DIR}/patients.json`);

  // Optionally seed to DB
  if (process.argv.includes('--seed-db')) {
    await seedToDatabase(patients);
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
