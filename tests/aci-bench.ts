import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getAnthropicClient, SOAP_NOTE_SYSTEM_PROMPT } from '@second-opinion/shared';
import { loadACIBench, type ACIBenchSample } from './utils/dataset-loader';
import { rougeScore, printResultsTable } from './utils/metrics';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MODEL = process.env.BENCHMARK_MODEL || 'claude-sonnet-4-5-20250929';
const SAMPLES = parseInt(process.env.ACI_BENCH_SAMPLES || '0', 10); // 0 = all
const CONCURRENCY = parseInt(process.env.ACI_BENCH_CONCURRENCY || '5', 10);

const THRESHOLDS = {
  aci_overall_rouge: 0.25,
  aci_subjective_rouge: 0.20,
  aci_objective_rouge: 0.15,
  aci_assessment_rouge: 0.08, // Lower: ACI-BENCH references use combined "ASSESSMENT AND PLAN"
  aci_plan_rouge: 0.20,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SOAPSections {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface SampleResult {
  id: string;
  overallRouge: number;
  sectionRouge: { subjective: number; objective: number; assessment: number; plan: number };
  error?: string;
}

// ---------------------------------------------------------------------------
// SOAP section parsing
// ---------------------------------------------------------------------------

/**
 * Parse text into SOAP sections. Handles multiple formats:
 * - Markdown: ## Subjective / ## Objective / ## Assessment / ## Plan
 * - Abbreviated: S: / O: / A: / P:
 * - Uppercase: SUBJECTIVE: / OBJECTIVE: / etc.
 * - ACI-BENCH reference: HISTORY OF PRESENT ILLNESS → subjective,
 *   PHYSICAL EXAM / RESULTS → objective, ASSESSMENT → assessment, PLAN → plan
 */
function parseSOAPSections(text: string): SOAPSections {
  const result: SOAPSections = { subjective: '', objective: '', assessment: '', plan: '' };

  // Try markdown headers: ## Subjective, ## Objective (S), etc.
  const mdPattern = /##\s*(Subjective|Objective|Assessment|Plan)(?:\s*\([^)]*\))?/gi;
  if (mdPattern.test(text)) {
    const sections = text.split(/##\s*(?:Subjective|Objective|Assessment|Plan)(?:\s*\([^)]*\))?/i);
    const headers = text.match(/##\s*(Subjective|Objective|Assessment|Plan)/gi) || [];
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase();
      const content = (sections[i + 1] || '').trim();
      if (header.includes('subjective')) result.subjective = content;
      else if (header.includes('objective')) result.objective = content;
      else if (header.includes('assessment')) result.assessment = content;
      else if (header.includes('plan')) result.plan = content;
    }
    if (result.subjective || result.objective || result.assessment || result.plan) return result;
  }

  // Try S:/O:/A:/P: format
  const soapPattern = /^[SOAP]:\s/m;
  if (soapPattern.test(text)) {
    const lines = text.split('\n');
    let current: keyof SOAPSections | null = null;
    const buffer: string[] = [];

    const flush = () => {
      if (current && buffer.length) {
        result[current] = buffer.join('\n').trim();
        buffer.length = 0;
      }
    };

    for (const line of lines) {
      const match = line.match(/^([SOAP]):\s*(.*)/);
      if (match) {
        flush();
        const letter = match[1];
        current = letter === 'S' ? 'subjective' : letter === 'O' ? 'objective' : letter === 'A' ? 'assessment' : 'plan';
        if (match[2]) buffer.push(match[2]);
      } else if (current) {
        buffer.push(line);
      }
    }
    flush();
    if (result.subjective || result.objective || result.assessment || result.plan) return result;
  }

  // Try UPPERCASE: headers (SUBJECTIVE: / OBJECTIVE: etc.)
  const upperPattern = /^(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)\s*:/m;
  if (upperPattern.test(text)) {
    const parts = text.split(/^(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)\s*:/im);
    for (let i = 1; i < parts.length; i += 2) {
      const header = parts[i].toLowerCase();
      const content = (parts[i + 1] || '').trim();
      if (header === 'subjective') result.subjective = content;
      else if (header === 'objective') result.objective = content;
      else if (header === 'assessment') result.assessment = content;
      else if (header === 'plan') result.plan = content;
    }
    if (result.subjective || result.objective || result.assessment || result.plan) return result;
  }

  // Try ACI-BENCH reference format:
  // CHIEF COMPLAINT / HISTORY OF PRESENT ILLNESS / REVIEW OF SYSTEMS → subjective
  // PHYSICAL EXAM / PHYSICAL EXAMINATION / RESULTS → objective
  // ASSESSMENT / ASSESSMENT AND PLAN → assessment (+ plan)
  // PLAN → plan
  const aciHeaderPattern = /^(CHIEF COMPLAINT|HISTORY OF PRESENT ILLNESS|HPI|REVIEW OF SYSTEMS|PHYSICAL EXAM(?:INATION)?|RESULTS|ASSESSMENT AND PLAN|ASSESSMENT|PLAN)\s*$/m;
  if (aciHeaderPattern.test(text)) {
    // Split on section headers (must match "ASSESSMENT AND PLAN" before bare "ASSESSMENT")
    const parts = text.split(aciHeaderPattern);
    for (let i = 1; i < parts.length; i += 2) {
      const header = parts[i].toUpperCase();
      const content = (parts[i + 1] || '').trim();
      if (['HISTORY OF PRESENT ILLNESS', 'CHIEF COMPLAINT', 'HPI', 'REVIEW OF SYSTEMS'].includes(header)) {
        result.subjective += (result.subjective ? '\n' : '') + content;
      } else if (['PHYSICAL EXAM', 'PHYSICAL EXAMINATION', 'RESULTS'].includes(header)) {
        result.objective += (result.objective ? '\n' : '') + content;
      } else if (header === 'ASSESSMENT AND PLAN') {
        // Combined section — put in both
        result.assessment += (result.assessment ? '\n' : '') + content;
        result.plan += (result.plan ? '\n' : '') + content;
      } else if (header === 'ASSESSMENT') {
        result.assessment += (result.assessment ? '\n' : '') + content;
      } else if (header === 'PLAN') {
        result.plan += (result.plan ? '\n' : '') + content;
      }
    }
    if (result.subjective || result.objective || result.assessment || result.plan) return result;
  }

  // Fallback: put entire text in all fields (degrades to full-text ROUGE)
  result.subjective = text;
  result.objective = text;
  result.assessment = text;
  result.plan = text;
  return result;
}

// ---------------------------------------------------------------------------
// Dialogue formatting
// ---------------------------------------------------------------------------

/**
 * Convert ACI-BENCH [doctor]/[patient] format to Doctor:/Patient: format
 * for compatibility with our SOAP prompt.
 */
function formatDialogue(dialogue: string): string {
  return dialogue
    .replace(/\[doctor\]\s*/gi, 'Doctor: ')
    .replace(/\[patient\]\s*/gi, 'Patient: ');
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== ACI-BENCH — Ambient Clinical Intelligence Benchmark ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  // 1. Load dataset
  console.log('Step 1: Loading ACI-BENCH dataset...');
  const allSamples = await loadACIBench();
  const samples = SAMPLES > 0 ? allSamples.slice(0, SAMPLES) : allSamples;
  console.log(`  Loaded ${allSamples.length} samples, running ${samples.length}\n`);

  // 2. Run SOAP note generation
  console.log(`Step 2: Generating SOAP notes (concurrency=${CONCURRENCY})...`);
  const client = getAnthropicClient();
  const results: SampleResult[] = new Array(samples.length);

  await runWithConcurrency(samples, CONCURRENCY, async (sample, i) => {
    const tag = `[${i + 1}/${samples.length}]`;
    try {
      const formatted = formatDialogue(sample.dialogue);

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SOAP_NOTE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Generate a SOAP note from the following consultation transcript:\n\n${formatted}` }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      const generated = textContent && textContent.type === 'text' ? textContent.text : '';

      // Parse sections
      const genSections = parseSOAPSections(generated);
      const refSections = parseSOAPSections(sample.reference);

      // Compute per-section ROUGE
      const sectionRouge = {
        subjective: rougeScore(refSections.subjective, genSections.subjective),
        objective: rougeScore(refSections.objective, genSections.objective),
        assessment: rougeScore(refSections.assessment, genSections.assessment),
        plan: rougeScore(refSections.plan, genSections.plan),
      };

      // Overall ROUGE (full text)
      const overallRouge = rougeScore(sample.reference, generated);

      results[i] = { id: sample.id, overallRouge, sectionRouge };

      console.log(`  ${tag} overall=${overallRouge.toFixed(3)} S=${sectionRouge.subjective.toFixed(3)} O=${sectionRouge.objective.toFixed(3)} A=${sectionRouge.assessment.toFixed(3)} P=${sectionRouge.plan.toFixed(3)}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results[i] = {
        id: sample.id,
        overallRouge: 0,
        sectionRouge: { subjective: 0, objective: 0, assessment: 0, plan: 0 },
        error: errMsg,
      };
      console.log(`  ${tag} ERROR — ${errMsg}`);
    }
  });

  // 3. Aggregate metrics
  console.log('\nStep 3: Aggregating results...');

  const valid = results.filter(r => !r.error);
  const metrics: Record<string, number> = {
    aci_overall_rouge: avg(valid.map(r => r.overallRouge)),
    aci_subjective_rouge: avg(valid.map(r => r.sectionRouge.subjective)),
    aci_objective_rouge: avg(valid.map(r => r.sectionRouge.objective)),
    aci_assessment_rouge: avg(valid.map(r => r.sectionRouge.assessment)),
    aci_plan_rouge: avg(valid.map(r => r.sectionRouge.plan)),
  };

  // 4. Print results table
  const tableResults = [
    { name: 'Overall ROUGE', pass: metrics.aci_overall_rouge >= THRESHOLDS.aci_overall_rouge, metric: 'ROUGE-1', value: metrics.aci_overall_rouge, threshold: THRESHOLDS.aci_overall_rouge },
    { name: '─── Per-Section ROUGE ───', pass: true, metric: '', value: 0 },
    { name: 'Subjective', pass: metrics.aci_subjective_rouge >= THRESHOLDS.aci_subjective_rouge, metric: 'ROUGE-1', value: metrics.aci_subjective_rouge, threshold: THRESHOLDS.aci_subjective_rouge },
    { name: 'Objective', pass: metrics.aci_objective_rouge >= THRESHOLDS.aci_objective_rouge, metric: 'ROUGE-1', value: metrics.aci_objective_rouge, threshold: THRESHOLDS.aci_objective_rouge },
    { name: 'Assessment', pass: metrics.aci_assessment_rouge >= THRESHOLDS.aci_assessment_rouge, metric: 'ROUGE-1', value: metrics.aci_assessment_rouge, threshold: THRESHOLDS.aci_assessment_rouge },
    { name: 'Plan', pass: metrics.aci_plan_rouge >= THRESHOLDS.aci_plan_rouge, metric: 'ROUGE-1', value: metrics.aci_plan_rouge, threshold: THRESHOLDS.aci_plan_rouge },
    { name: `Samples evaluated (${valid.length}/${results.length})`, pass: valid.length > 0, metric: 'count', value: valid.length, details: results.length - valid.length > 0 ? `${results.length - valid.length} errors` : undefined },
  ];

  printResultsTable(tableResults);

  // 5. Reference comparison
  console.log('--- Reference Comparison (ACI-BENCH, Nature Scientific Data 2023) ---');
  console.log('  T5-large:       ~42 ROUGE-1');
  console.log('  GPT-4:          ~46 ROUGE-1');
  console.log(`  This run (${MODEL}): ${(metrics.aci_overall_rouge * 100).toFixed(1)} ROUGE-1`);
  console.log();

  // 6. Save results
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = join(resultsDir, `aci-bench-${timestamp}.json`);
  const output = {
    timestamp: new Date().toISOString(),
    config: { model: MODEL, sampleCount: samples.length, concurrency: CONCURRENCY },
    thresholds: THRESHOLDS,
    metrics,
    sectionScores: {
      subjective: valid.map(r => r.sectionRouge.subjective),
      objective: valid.map(r => r.sectionRouge.objective),
      assessment: valid.map(r => r.sectionRouge.assessment),
      plan: valid.map(r => r.sectionRouge.plan),
    },
    successCount: valid.length,
    errorCount: results.length - valid.length,
    results: results.map(r => ({
      id: r.id,
      overallRouge: r.overallRouge,
      sectionRouge: r.sectionRouge,
      error: r.error,
    })),
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Results saved to ${outputPath}`);

  // 7. Exit code
  const anyFail = Object.entries(THRESHOLDS).some(
    ([key, threshold]) => (metrics[key] ?? 0) < threshold,
  );

  if (anyFail) {
    console.log('\nBENCHMARK FAILED — one or more metrics below threshold.\n');
    process.exit(1);
  } else {
    console.log('\nBENCHMARK PASSED — all metrics meet thresholds.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('ACI-BENCH crashed:', err);
  process.exit(2);
});
