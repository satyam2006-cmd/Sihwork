import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { extractVisitData, evaluateExtraction, evaluateConversation, getAnthropicClient, VisitExtractionSchema } from '@second-opinion/shared';
import { VISIT_EXTRACTION_SYSTEM_PROMPT } from '@second-opinion/shared';
import type { ChatMessage, ExtractionEval, ConversationEval, VisitExtraction } from '@second-opinion/shared';
import { loadSOAPSamples } from './utils/dataset-loader';
import { rougeScore, fieldCoverage, printResultsTable, loadBaseline, saveBaseline, compareWithBaseline, printComparisonTable } from './utils/metrics';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HARD_SAMPLE_COUNT = parseInt(process.env.BENCHMARK_SAMPLES || '50', 10);
const CONVERSATION_EVAL_COUNT = parseInt(process.env.BENCHMARK_CONV_SAMPLES || '20', 10);
const CONCURRENCY = parseInt(process.env.BENCHMARK_CONCURRENCY || '5', 10);
const MODEL = process.env.BENCHMARK_MODEL || 'claude-sonnet-4-5-20250929';

const THRESHOLDS = {
  extraction_faithfulness: 0.85,
  extraction_completeness: 0.75,
  extraction_correctness: 0.80,
  field_coverage: 0.80,
  rouge_vs_soap: 0.20,
  conversation_safety: 0.90,
} as const;

const EXPECTED_EXTRACTION_FIELDS = [
  'chief_complaint',
  'symptoms',
  'assessment',
  'diagnoses',
  'recommendations',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SampleResult {
  index: number;
  dialogueLength: number;
  extraction?: VisitExtraction;
  extractionEval?: ExtractionEval;
  conversationEval?: ConversationEval;
  fieldCoverage?: { coverage: number; missing: string[] };
  rougeVsSoap?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a dialogue string into ChatMessage[] alternating patient/doctor turns. */
function dialogueToChatMessages(dialogue: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  // Split on "Doctor:" or "Patient:" labels
  const lines = dialogue.split(/\n/).filter(l => l.trim());
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent = '';

  for (const line of lines) {
    const doctorMatch = line.match(/^(?:Doctor|doctor|DOCTOR)\s*:\s*(.*)/);
    const patientMatch = line.match(/^(?:Patient|patient|PATIENT)\s*:\s*(.*)/);

    if (doctorMatch) {
      if (currentRole && currentContent.trim()) {
        messages.push({
          id: `msg-${messages.length}`,
          role: currentRole,
          content: currentContent.trim(),
          timestamp: new Date().toISOString(),
        });
      }
      currentRole = 'assistant';
      currentContent = doctorMatch[1];
    } else if (patientMatch) {
      if (currentRole && currentContent.trim()) {
        messages.push({
          id: `msg-${messages.length}`,
          role: currentRole,
          content: currentContent.trim(),
          timestamp: new Date().toISOString(),
        });
      }
      currentRole = 'user';
      currentContent = patientMatch[1];
    } else {
      // Continuation of current speaker
      currentContent += ' ' + line.trim();
    }
  }

  // Push last message
  if (currentRole && currentContent.trim()) {
    messages.push({
      id: `msg-${messages.length}`,
      role: currentRole,
      content: currentContent.trim(),
      timestamp: new Date().toISOString(),
    });
  }

  return messages;
}

/** Render a VisitExtraction as a pseudo-SOAP string for ROUGE comparison. */
function extractionToSOAPString(extraction: VisitExtraction): string {
  const parts: string[] = [];

  // Subjective
  parts.push(`S: Chief complaint: ${extraction.chief_complaint}`);
  if (extraction.symptoms.length > 0) {
    const symptomsStr = extraction.symptoms
      .map(s => `${s.name}${s.severity ? ` (${s.severity})` : ''}${s.duration ? `, duration: ${s.duration}` : ''}`)
      .join('; ');
    parts.push(`Symptoms: ${symptomsStr}`);
  }

  // Objective
  if (extraction.vitals) {
    const vitalsEntries = Object.entries(extraction.vitals).filter(([, v]) => v);
    if (vitalsEntries.length > 0) {
      parts.push(`O: Vitals: ${vitalsEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    }
  }

  // Assessment
  parts.push(`A: ${extraction.assessment}`);
  if (extraction.diagnoses.length > 0) {
    const diagStr = extraction.diagnoses
      .map(d => `${d.condition}${d.confidence ? ` (${d.confidence})` : ''}`)
      .join('; ');
    parts.push(`Diagnoses: ${diagStr}`);
  }
  if (extraction.red_flags.length > 0) {
    parts.push(`Red flags: ${extraction.red_flags.join('; ')}`);
  }

  // Plan
  if (extraction.recommendations.length > 0) {
    const recStr = extraction.recommendations
      .map(r => `${r.type}: ${r.description}`)
      .join('; ');
    parts.push(`P: ${recStr}`);
  }
  if (extraction.follow_up) {
    parts.push(`Follow-up: ${extraction.follow_up}`);
  }
  if (extraction.medication_changes.length > 0) {
    const medStr = extraction.medication_changes
      .map(m => `${m.action} ${m.medication}${m.details ? ` - ${m.details}` : ''}`)
      .join('; ');
    parts.push(`Medication changes: ${medStr}`);
  }

  return parts.join('\n');
}

/**
 * Extract visit data with lenient Zod parsing for benchmarks.
 * Falls back to stripping invalid enum values if strict parse fails.
 */
async function extractVisitDataLenient(messages: ChatMessage[], model: string): Promise<VisitExtraction> {
  try {
    return await extractVisitData(messages, undefined, model);
  } catch (err) {
    // If Zod validation failed, re-extract with raw JSON and do a lenient parse
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!errMsg.includes('invalid_enum_value') && !errMsg.includes('Invalid enum')) {
      throw err;
    }

    // Re-call Claude to get the raw extraction (bypass Zod)
    const client = getAnthropicClient();
    const transcriptText = messages.map(m => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.content}`).join('\n');
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: VISIT_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `TRANSCRIPT:\n${transcriptText}` }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') throw new Error('No text response');
    let jsonStr = textContent.text.trim();
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    const raw = JSON.parse(jsonStr);
    // Strip invalid enum values so Zod accepts it
    if (Array.isArray(raw.symptoms)) {
      for (const s of raw.symptoms) {
        if (s.severity && !['mild', 'moderate', 'severe'].includes(s.severity)) delete s.severity;
        if (s.frequency && typeof s.frequency !== 'string') delete s.frequency;
      }
    }
    if (Array.isArray(raw.recommendations)) {
      for (const r of raw.recommendations) {
        if (r.type && !['test', 'medication', 'lifestyle', 'referral', 'follow_up', 'other'].includes(r.type)) r.type = 'other';
        if (r.urgency && !['routine', 'soon', 'urgent'].includes(r.urgency)) delete r.urgency;
      }
    }
    if (Array.isArray(raw.diagnoses)) {
      for (const d of raw.diagnoses) {
        if (d.confidence && !['suspected', 'probable', 'confirmed'].includes(d.confidence)) delete d.confidence;
      }
    }
    if (Array.isArray(raw.medication_changes)) {
      for (const m of raw.medication_changes) {
        if (m.action && !['start', 'stop', 'modify', 'continue'].includes(m.action)) m.action = 'continue';
      }
    }

    return VisitExtractionSchema.parse(raw);
  }
}

/** Run async tasks with bounded concurrency. */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Main benchmark
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Second Opinion AI — Comprehensive Benchmark ===');
  console.log(`Model: ${MODEL}\n`);

  // 1. Load and select hard samples (try test split, fall back to validation)
  console.log('Step 1: Loading SOAP samples...');
  let allSamples = await loadSOAPSamples(250, 'test');
  if (allSamples.length < HARD_SAMPLE_COUNT) {
    console.log(`  Test split only returned ${allSamples.length} samples, also loading validation split...`);
    const validationSamples = await loadSOAPSamples(250, 'validation');
    allSamples = [...allSamples, ...validationSamples];
  }
  console.log(`  Loaded ${allSamples.length} total samples`);

  // Sort by dialogue length (longer = harder)
  const sorted = allSamples
    .map((s, i) => ({ ...s, originalIndex: i, length: s.dialogue.length }))
    .sort((a, b) => b.length - a.length);

  const hardSamples = sorted.slice(0, HARD_SAMPLE_COUNT);
  console.log(`  Selected top ${hardSamples.length} by dialogue length (range: ${hardSamples[hardSamples.length - 1]?.length ?? 0}–${hardSamples[0]?.length ?? 0} chars)\n`);

  // 2. Run extraction evaluation
  console.log(`Step 2: Running extraction evaluation on ${hardSamples.length} samples (concurrency=${CONCURRENCY})...`);
  const results: SampleResult[] = hardSamples.map((s, i) => ({
    index: i,
    dialogueLength: s.length,
  }));

  await runWithConcurrency(hardSamples, CONCURRENCY, async (sample, i) => {
    const tag = `[${i + 1}/${hardSamples.length}]`;
    try {
      const messages = dialogueToChatMessages(sample.dialogue);
      if (messages.length === 0) {
        results[i].error = 'No parseable messages in dialogue';
        console.log(`  ${tag} SKIP — empty dialogue`);
        return;
      }

      // A. Extract visit data (lenient parsing for benchmarks)
      const extraction = await extractVisitDataLenient(messages, MODEL);
      results[i].extraction = extraction;

      // B. Claude-as-judge extraction eval
      const evalResult = await evaluateExtraction(messages, extraction, MODEL);
      results[i].extractionEval = evalResult;

      // C. Field coverage
      const coverage = fieldCoverage(
        extraction as unknown as Record<string, unknown>,
        EXPECTED_EXTRACTION_FIELDS,
      );
      results[i].fieldCoverage = coverage;

      // D. ROUGE vs reference SOAP
      const soapString = extractionToSOAPString(extraction);
      const rouge = rougeScore(sample.soap, soapString);
      results[i].rougeVsSoap = rouge;

      console.log(`  ${tag} OK — faith=${evalResult.faithfulness.toFixed(2)} compl=${evalResult.completeness.toFixed(2)} corr=${evalResult.correctness.toFixed(2)} rouge=${rouge.toFixed(2)} cov=${coverage.coverage.toFixed(2)}`);
    } catch (err) {
      results[i].error = err instanceof Error ? err.message : String(err);
      console.log(`  ${tag} ERROR — ${results[i].error}`);
    }
  });

  // 3. Conversation quality evaluation on subset
  console.log(`\nStep 3: Running conversation quality evaluation on ${CONVERSATION_EVAL_COUNT} samples...`);
  const convSubset = hardSamples.slice(0, CONVERSATION_EVAL_COUNT);

  await runWithConcurrency(convSubset, CONCURRENCY, async (sample, i) => {
    const tag = `[${i + 1}/${convSubset.length}]`;
    try {
      const messages = dialogueToChatMessages(sample.dialogue);
      if (messages.length === 0) return;

      const convEval = await evaluateConversation(messages, MODEL);
      results[i].conversationEval = convEval;

      console.log(`  ${tag} OK — safety=${convEval.safety.toFixed(2)} thoroughness=${convEval.thoroughness.toFixed(2)} empathy=${convEval.empathy.toFixed(2)}`);
    } catch (err) {
      console.log(`  ${tag} ERROR — ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // 4. Aggregate metrics
  console.log('\nStep 4: Aggregating results...');
  const successful = results.filter(r => r.extractionEval && !r.error);
  const withConv = results.filter(r => r.conversationEval);

  const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  const metrics = {
    extraction_faithfulness: avg(successful.map(r => r.extractionEval!.faithfulness)),
    extraction_completeness: avg(successful.map(r => r.extractionEval!.completeness)),
    extraction_correctness: avg(successful.map(r => r.extractionEval!.correctness)),
    extraction_consistency: avg(successful.map(r => r.extractionEval!.consistency)),
    extraction_overall: avg(successful.map(r => r.extractionEval!.overall_confidence)),
    field_coverage: avg(successful.map(r => r.fieldCoverage?.coverage ?? 0)),
    rouge_vs_soap: avg(successful.map(r => r.rougeVsSoap ?? 0)),
    conversation_thoroughness: avg(withConv.map(r => r.conversationEval!.thoroughness)),
    conversation_empathy: avg(withConv.map(r => r.conversationEval!.empathy)),
    conversation_safety: avg(withConv.map(r => r.conversationEval!.safety)),
    conversation_accuracy: avg(withConv.map(r => r.conversationEval!.accuracy)),
    conversation_follow_up: avg(withConv.map(r => r.conversationEval!.follow_up_quality)),
    conversation_overall: avg(withConv.map(r => r.conversationEval!.overall_quality)),
  };

  // 5. Print summary table
  const tableResults = [
    { name: 'Extraction faithfulness', pass: metrics.extraction_faithfulness >= THRESHOLDS.extraction_faithfulness, metric: 'avg', value: metrics.extraction_faithfulness, threshold: THRESHOLDS.extraction_faithfulness },
    { name: 'Extraction completeness', pass: metrics.extraction_completeness >= THRESHOLDS.extraction_completeness, metric: 'avg', value: metrics.extraction_completeness, threshold: THRESHOLDS.extraction_completeness },
    { name: 'Extraction correctness', pass: metrics.extraction_correctness >= THRESHOLDS.extraction_correctness, metric: 'avg', value: metrics.extraction_correctness, threshold: THRESHOLDS.extraction_correctness },
    { name: 'Extraction consistency', pass: true, metric: 'avg', value: metrics.extraction_consistency },
    { name: 'Extraction overall confidence', pass: true, metric: 'avg', value: metrics.extraction_overall },
    { name: 'Field coverage', pass: metrics.field_coverage >= THRESHOLDS.field_coverage, metric: 'avg', value: metrics.field_coverage, threshold: THRESHOLDS.field_coverage },
    { name: 'ROUGE vs reference SOAP', pass: metrics.rouge_vs_soap >= THRESHOLDS.rouge_vs_soap, metric: 'avg', value: metrics.rouge_vs_soap, threshold: THRESHOLDS.rouge_vs_soap },
    { name: 'Conversation safety', pass: metrics.conversation_safety >= THRESHOLDS.conversation_safety, metric: 'avg', value: metrics.conversation_safety, threshold: THRESHOLDS.conversation_safety },
    { name: 'Conversation thoroughness', pass: true, metric: 'avg', value: metrics.conversation_thoroughness },
    { name: 'Conversation empathy', pass: true, metric: 'avg', value: metrics.conversation_empathy },
    { name: 'Conversation accuracy', pass: true, metric: 'avg', value: metrics.conversation_accuracy },
    { name: 'Conversation overall', pass: true, metric: 'avg', value: metrics.conversation_overall },
    { name: `Samples evaluated (${successful.length}/${results.length})`, pass: successful.length > 0, metric: 'count', value: successful.length, details: results.length - successful.length > 0 ? `${results.length - successful.length} errors` : undefined },
  ];

  printResultsTable(tableResults);

  // 6b. Baseline comparison
  const baseline = loadBaseline();
  let comparison: ReturnType<typeof compareWithBaseline> | null = null;
  if (baseline) {
    comparison = compareWithBaseline(metrics, baseline);
    printComparisonTable(comparison.deltas, baseline.timestamp, comparison);

    // Warn on significant regressions (>5% drop)
    const significantRegressions = comparison.deltas.filter(
      d => d.arrow === '\u2193' && Math.abs(d.delta) > 0.05,
    );
    if (significantRegressions.length > 0) {
      console.log('WARNING: Significant regressions detected (>5% drop):');
      for (const r of significantRegressions) {
        console.log(`  ${r.metric}: ${r.baseline.toFixed(3)} -> ${r.current.toFixed(3)} (${(r.delta * 100).toFixed(1)}%)`);
      }
      console.log();
    }
  } else {
    console.log('No baseline found. Run with BENCHMARK_SAVE_BASELINE=1 to save one.\n');
  }

  // 6c. Save baseline if requested
  if (process.env.BENCHMARK_SAVE_BASELINE === '1') {
    saveBaseline(metrics);
  }

  // 7. Save detailed results (with comparison data)
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = join(resultsDir, `benchmark-${timestamp}.json`);
  const output = {
    timestamp: new Date().toISOString(),
    config: { model: MODEL, hardSampleCount: HARD_SAMPLE_COUNT, conversationEvalCount: CONVERSATION_EVAL_COUNT, concurrency: CONCURRENCY },
    thresholds: THRESHOLDS,
    metrics,
    comparison: comparison ? {
      baselineTimestamp: baseline!.timestamp,
      deltas: comparison.deltas,
      improvements: comparison.improvements,
      regressions: comparison.regressions,
      unchanged: comparison.unchanged,
    } : null,
    successCount: successful.length,
    errorCount: results.length - successful.length,
    samples: results,
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`  Results saved to ${outputPath}`);

  // 8. Show worst-performing samples for any failing metric
  const failingMetrics = tableResults.filter(r => !r.pass && r.threshold !== undefined);
  if (failingMetrics.length > 0) {
    console.log('\n--- Worst-performing samples for failing metrics ---\n');
    for (const fm of failingMetrics) {
      console.log(`${fm.name} (${fm.value.toFixed(3)} < ${fm.threshold}):`);
      const sorted = [...successful];

      if (fm.name.includes('faithfulness')) sorted.sort((a, b) => a.extractionEval!.faithfulness - b.extractionEval!.faithfulness);
      else if (fm.name.includes('completeness')) sorted.sort((a, b) => a.extractionEval!.completeness - b.extractionEval!.completeness);
      else if (fm.name.includes('correctness')) sorted.sort((a, b) => a.extractionEval!.correctness - b.extractionEval!.correctness);
      else if (fm.name.includes('Field coverage')) sorted.sort((a, b) => (a.fieldCoverage?.coverage ?? 0) - (b.fieldCoverage?.coverage ?? 0));
      else if (fm.name.includes('ROUGE')) sorted.sort((a, b) => (a.rougeVsSoap ?? 0) - (b.rougeVsSoap ?? 0));
      else if (fm.name.includes('safety')) sorted.sort((a, b) => (a.conversationEval?.safety ?? 0) - (b.conversationEval?.safety ?? 0));

      for (const s of sorted.slice(0, 5)) {
        const detail = fm.name.includes('ROUGE')
          ? `rouge=${(s.rougeVsSoap ?? 0).toFixed(3)}`
          : fm.name.includes('Field')
            ? `coverage=${(s.fieldCoverage?.coverage ?? 0).toFixed(3)}, missing=[${s.fieldCoverage?.missing.join(', ') ?? ''}]`
            : fm.name.includes('safety')
              ? `safety=${(s.conversationEval?.safety ?? 0).toFixed(3)}`
              : `faith=${s.extractionEval!.faithfulness.toFixed(3)} compl=${s.extractionEval!.completeness.toFixed(3)} corr=${s.extractionEval!.correctness.toFixed(3)}`;
        console.log(`  Sample #${s.index} (${s.dialogueLength} chars): ${detail}`);
      }
      console.log();
    }
  }

  // 8. Exit code
  const anyFail = tableResults.some(r => !r.pass && r.threshold !== undefined);
  if (anyFail) {
    console.log('BENCHMARK FAILED — one or more metrics below threshold.\n');
    process.exit(1);
  } else {
    console.log('BENCHMARK PASSED — all metrics meet thresholds.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Benchmark crashed:', err);
  process.exit(2);
});
