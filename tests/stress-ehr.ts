/**
 * EHR Scaling Test
 *
 * Validates that the system prompt stays within token budget even for
 * patients with many documents and complex medical histories.
 */
import 'dotenv/config';
import { buildSystemPrompt, estimateTokens, TOKEN_BUDGET, type EHRContext } from '@second-opinion/shared';
import { generateSyntheticPatient } from './utils/dataset-loader';
import { printResultsTable } from './utils/metrics';

interface TestResult {
  name: string;
  pass: boolean;
  metric: string;
  value: number;
  threshold: number;
  details?: string;
}

function makeEHRContext(
  patient: ReturnType<typeof generateSyntheticPatient>,
  priorSessions: number = 0,
): EHRContext {
  const sessions = [];
  for (let i = 0; i < priorSessions; i++) {
    sessions.push({
      started_at: new Date(2024, i, 15).toISOString(),
      summary_text: `Session ${i + 1}: Patient presented with symptoms. Assessment provided.`,
      key_findings: [`Finding ${i + 1}A: condition noted`, `Finding ${i + 1}B: treatment discussed`],
      follow_up_items: [`Follow up on test results`, `Schedule next appointment`],
    });
  }

  return {
    patient: patient.patient,
    documents: patient.documents,
    priorSessions: sessions,
  };
}

async function main() {
  const results: TestResult[] = [];

  // Test each complexity level
  const testCases: Array<{
    name: string;
    complexity: 'simple' | 'moderate' | 'complex' | 'edge';
    priorSessions: number;
    maxTokens: number;
  }> = [
    { name: 'Simple patient (1 doc, 0 sessions)', complexity: 'simple', priorSessions: 0, maxTokens: 5_000 },
    { name: 'Moderate patient (5 docs, 2 sessions)', complexity: 'moderate', priorSessions: 2, maxTokens: 10_000 },
    { name: 'Complex patient (15 docs, 3 sessions)', complexity: 'complex', priorSessions: 3, maxTokens: 20_000 },
    { name: 'Edge case (25 docs, 3 sessions, polypharmacy)', complexity: 'edge', priorSessions: 3, maxTokens: 28_000 },
  ];

  for (const tc of testCases) {
    const patient = generateSyntheticPatient(tc.complexity);
    const ehrContext = makeEHRContext(patient, tc.priorSessions);
    const systemPrompt = buildSystemPrompt(ehrContext);
    const tokens = estimateTokens(systemPrompt);

    results.push({
      name: tc.name,
      pass: tokens <= tc.maxTokens,
      metric: 'tokens',
      value: tokens,
      threshold: tc.maxTokens,
      details: `${patient.documents.length} docs, ${tc.priorSessions} sessions, prompt length: ${systemPrompt.length} chars`,
    });
  }

  // Test that EHR context budget is respected
  const edgePatient = generateSyntheticPatient('edge');
  const edgeContext = makeEHRContext(edgePatient, 3);
  const edgePrompt = buildSystemPrompt(edgeContext);
  const edgeTokens = estimateTokens(edgePrompt);

  results.push({
    name: 'System prompt within total EHR budget',
    pass: edgeTokens <= TOKEN_BUDGET.system_prompt + TOKEN_BUDGET.ehr_context,
    metric: 'tokens',
    value: edgeTokens,
    threshold: TOKEN_BUDGET.system_prompt + TOKEN_BUDGET.ehr_context,
  });

  // Test document truncation works
  const hugePatient = generateSyntheticPatient('edge');
  // Add 50 more documents
  for (let i = 25; i < 50; i++) {
    hugePatient.documents.push({
      file_name: `extra-doc-${i}.pdf`,
      extracted_data: { test: `data-${i}` },
      extracted_summary: `Extra document ${i} with additional test results and findings from multiple clinical departments.`,
      uploaded_at: new Date(2023, i % 12, 1).toISOString(),
    });
  }
  const hugeContext = makeEHRContext(hugePatient, 3);
  const hugePrompt = buildSystemPrompt(hugeContext);
  const hugeTokens = estimateTokens(hugePrompt);

  results.push({
    name: 'System prompt with 50 documents still within budget',
    pass: hugeTokens <= TOKEN_BUDGET.system_prompt + TOKEN_BUDGET.ehr_context,
    metric: 'tokens',
    value: hugeTokens,
    threshold: TOKEN_BUDGET.system_prompt + TOKEN_BUDGET.ehr_context,
    details: `50 documents (only first 10 fetched from DB, but testing prompt builder with more)`,
  });

  printResultsTable(results);

  const allPassed = results.every(r => r.pass);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
