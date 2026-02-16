import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getAnthropicClient } from '@second-opinion/shared';
import { loadMedXpertQA, type MedXpertQASample } from './utils/dataset-loader';
import { printResultsTable } from './utils/metrics';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MODEL = process.env.BENCHMARK_MODEL || 'claude-sonnet-4-5-20250929';
const SAMPLES = parseInt(process.env.MEDXPERT_SAMPLES || '0', 10); // 0 = all ~2,460
const CONCURRENCY = parseInt(process.env.MEDXPERT_CONCURRENCY || '5', 10);

const THRESHOLDS = {
  overall: 0.50,
  reasoning: 0.45,
  understanding: 0.55,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionResult {
  id: string;
  correct: boolean;
  predicted: string | null;
  expected: string;
  medical_task: string;
  body_system: string;
  question_type: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Answer extraction
// ---------------------------------------------------------------------------

const VALID_LETTERS = new Set('ABCDEFGHIJ'.split(''));

function extractAnswer(response: string): string | null {
  const text = response.trim();

  // 1. Structured: "The answer is B", "Answer: B"
  const structured = text.match(/(?:the answer is|answer[:]\s*)\(?([A-J])\)?/i);
  if (structured) return structured[1].toUpperCase();

  // 2. Line-start: "B)", "B.", "(B)" at start of a line
  const lineStart = text.match(/^[\s]*\(?([A-J])[.)]/m);
  if (lineStart) return lineStart[1].toUpperCase();

  // 3. Standalone letter on its own line
  const standalone = text.match(/^[\s]*([A-J])[\s]*$/m);
  if (standalone) return standalone[1].toUpperCase();

  // 4. Last resort: single [A-J] word boundary in the full response
  const allMatches = text.match(/\b([A-J])\b/g);
  if (allMatches && allMatches.length === 1) {
    const letter = allMatches[0].toUpperCase();
    if (VALID_LETTERS.has(letter)) return letter;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(sample: MedXpertQASample): string {
  // The question text often already contains "Answer Choices: (A) ... (B) ..."
  // Detect this to avoid duplicating the options
  const questionHasOptions = /Answer Choices\s*:/i.test(sample.question)
    || /\(A\)\s+\S/.test(sample.question);

  if (questionHasOptions) {
    return `${sample.question}\n\nAnswer with ONLY the letter of the correct option (A-J). Do not explain.`;
  }

  const optionLines = Object.entries(sample.options)
    .map(([letter, text]) => `${letter}) ${text}`)
    .join('\n');

  return `${sample.question}\n\n${optionLines}\n\nAnswer with ONLY the letter of the correct option (A-J). Do not explain.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function accuracyOf(results: QuestionResult[]): number {
  if (results.length === 0) return 0;
  return results.filter(r => r.correct).length / results.length;
}

function toMetricKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== MedXpertQA — Expert Medical Reasoning Benchmark ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  // 1. Load dataset
  console.log('Step 1: Loading MedXpertQA dataset...');
  const allSamples = await loadMedXpertQA();
  const samples = SAMPLES > 0 ? allSamples.slice(0, SAMPLES) : allSamples;
  console.log(`  Loaded ${allSamples.length} questions, running ${samples.length}\n`);

  // 2. Run MCQ evaluation
  console.log(`Step 2: Evaluating ${samples.length} questions (concurrency=${CONCURRENCY})...`);
  const client = getAnthropicClient();
  const results: QuestionResult[] = new Array(samples.length);

  await runWithConcurrency(samples, CONCURRENCY, async (sample, i) => {
    const tag = `[${i + 1}/${samples.length}]`;
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 64,
        system: 'You are a medical expert taking a board-style exam. For each question, think carefully about the clinical details, then respond with ONLY the single letter (A-J) of the correct answer. No explanation.',
        messages: [{ role: 'user', content: buildPrompt(sample) }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      const responseText = textContent && textContent.type === 'text' ? textContent.text : '';
      const predicted = extractAnswer(responseText);
      const correct = predicted === sample.label;

      results[i] = {
        id: sample.id,
        correct,
        predicted,
        expected: sample.label,
        medical_task: sample.medical_task,
        body_system: sample.body_system,
        question_type: sample.question_type,
      };

      const status = correct ? 'OK' : predicted ? 'WRONG' : 'NO_ANS';
      console.log(`  ${tag} ${status} — predicted=${predicted ?? '?'} expected=${sample.label} (${sample.medical_task}/${sample.body_system})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results[i] = {
        id: sample.id,
        correct: false,
        predicted: null,
        expected: sample.label,
        medical_task: sample.medical_task,
        body_system: sample.body_system,
        question_type: sample.question_type,
        error: errMsg,
      };
      console.log(`  ${tag} ERROR — ${errMsg}`);
    }
  });

  // 3. Aggregate metrics
  console.log('\nStep 3: Aggregating results...');

  const valid = results.filter(r => !r.error);
  const overall = accuracyOf(valid);

  // By medical_task
  const byTask: Record<string, QuestionResult[]> = {};
  for (const r of valid) {
    const key = r.medical_task || 'Unknown';
    (byTask[key] ??= []).push(r);
  }

  // By question_type
  const byType: Record<string, QuestionResult[]> = {};
  for (const r of valid) {
    const key = r.question_type || 'Unknown';
    (byType[key] ??= []).push(r);
  }

  // By body_system
  const bySystem: Record<string, QuestionResult[]> = {};
  for (const r of valid) {
    const key = r.body_system || 'Other';
    (bySystem[key] ??= []).push(r);
  }

  const metrics: Record<string, number> = {
    medxpert_overall: overall,
  };

  // Task metrics
  for (const [task, taskResults] of Object.entries(byTask)) {
    metrics[`medxpert_${toMetricKey(task)}`] = accuracyOf(taskResults);
  }

  // Type metrics
  for (const [type, typeResults] of Object.entries(byType)) {
    metrics[`medxpert_${toMetricKey(type)}`] = accuracyOf(typeResults);
  }

  // Body system metrics
  for (const [system, sysResults] of Object.entries(bySystem)) {
    metrics[`medxpert_${toMetricKey(system)}`] = accuracyOf(sysResults);
  }

  // 4. Print results table
  const tableResults = [
    { name: 'Overall accuracy', pass: overall >= THRESHOLDS.overall, metric: 'accuracy', value: overall, threshold: THRESHOLDS.overall },
    { name: '─── By Medical Task ───', pass: true, metric: '', value: 0 },
    ...Object.entries(byTask).map(([task, taskResults]) => ({
      name: task,
      pass: true,
      metric: 'accuracy',
      value: accuracyOf(taskResults),
      details: `n=${taskResults.length}`,
    })),
    { name: '─── By Question Type ───', pass: true, metric: '', value: 0 },
    ...Object.entries(byType).map(([type, typeResults]) => {
      const acc = accuracyOf(typeResults);
      const key = toMetricKey(type);
      const threshold = key === 'reasoning' ? THRESHOLDS.reasoning
        : key === 'understanding' ? THRESHOLDS.understanding
        : undefined;
      return {
        name: type,
        pass: threshold ? acc >= threshold : true,
        metric: 'accuracy',
        value: acc,
        threshold,
        details: `n=${typeResults.length}`,
      };
    }),
    { name: '─── By Body System ───', pass: true, metric: '', value: 0 },
    ...Object.entries(bySystem).map(([system, sysResults]) => ({
      name: system,
      pass: true,
      metric: 'accuracy',
      value: accuracyOf(sysResults),
      details: `n=${sysResults.length}`,
    })),
    { name: `Questions evaluated (${valid.length}/${results.length})`, pass: valid.length > 0, metric: 'count', value: valid.length, details: results.length - valid.length > 0 ? `${results.length - valid.length} errors` : undefined },
  ];

  printResultsTable(tableResults);

  // 5. Reference comparison
  console.log('--- Reference Comparison (MedXpertQA paper, ICML 2025) ---');
  console.log('  GPT-4o:         56.2%');
  console.log('  Claude 3.5:     53.8%');
  console.log('  Med-Gemini:     52.0%');
  console.log(`  This run (${MODEL}): ${(overall * 100).toFixed(1)}%`);
  console.log();

  // 6. Save results
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = join(resultsDir, `medxpertqa-${timestamp}.json`);
  const output = {
    timestamp: new Date().toISOString(),
    config: { model: MODEL, sampleCount: samples.length, concurrency: CONCURRENCY },
    thresholds: THRESHOLDS,
    metrics,
    correctCount: valid.filter(r => r.correct).length,
    totalCount: valid.length,
    errorCount: results.length - valid.length,
    breakdowns: {
      byTask: Object.fromEntries(Object.entries(byTask).map(([k, v]) => [k, { accuracy: accuracyOf(v), count: v.length }])),
      byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { accuracy: accuracyOf(v), count: v.length }])),
      bySystem: Object.fromEntries(Object.entries(bySystem).map(([k, v]) => [k, { accuracy: accuracyOf(v), count: v.length }])),
    },
    results: results.map(r => ({
      id: r.id,
      correct: r.correct,
      predicted: r.predicted,
      expected: r.expected,
      medical_task: r.medical_task,
      body_system: r.body_system,
      question_type: r.question_type,
      error: r.error,
    })),
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Results saved to ${outputPath}`);

  // 7. Exit code
  const reasoningAcc = metrics.medxpert_reasoning ?? overall;
  const understandingAcc = metrics.medxpert_understanding ?? overall;
  const anyFail = overall < THRESHOLDS.overall
    || reasoningAcc < THRESHOLDS.reasoning
    || understandingAcc < THRESHOLDS.understanding;

  if (anyFail) {
    console.log('\nBENCHMARK FAILED — one or more metrics below threshold.\n');
    process.exit(1);
  } else {
    console.log('\nBENCHMARK PASSED — all metrics meet thresholds.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('MedXpertQA crashed:', err);
  process.exit(2);
});
