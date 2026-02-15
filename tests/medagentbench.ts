import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureFHIRServer } from './utils/medagentbench/docker-health';
import { FHIRClient } from './utils/medagentbench/fhir-client';
import { runAgentLoop } from './utils/medagentbench/agent-loop';
import { evaluateTask } from './utils/medagentbench/evaluator';
import { loadMedAgentBenchTasks } from './utils/dataset-loader';
import { printResultsTable } from './utils/metrics';
import type { MedAgentTask, TaskResult, MedAgentMetrics, TaskCategory } from './utils/medagentbench/types';
import { getTaskCategory, getTaskType, CATEGORY_MAP } from './utils/medagentbench/types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MODEL = process.env.BENCHMARK_MODEL || 'claude-sonnet-4-5-20250929';
const SAMPLES = parseInt(process.env.MEDAGENT_SAMPLES || '0', 10); // 0 = all 300
const CONCURRENCY = parseInt(process.env.MEDAGENT_CONCURRENCY || '1', 10);
const MAX_ROUNDS = parseInt(process.env.MEDAGENT_MAX_ROUNDS || '8', 10);
const FHIR_BASE_URL = process.env.FHIR_BASE_URL || 'http://localhost:8080/fhir/';

const THRESHOLDS = {
  overall: 0.60,
  retrieval: 0.70,
  write: 0.50,
} as const;

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
  console.log('=== MedAgentBench — FHIR Agent Evaluation ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Max rounds: ${MAX_ROUNDS}, Concurrency: ${CONCURRENCY}`);
  console.log(`FHIR server: ${FHIR_BASE_URL}\n`);

  // 1. Verify FHIR server
  console.log('Step 1: Checking FHIR server health...');
  await ensureFHIRServer(FHIR_BASE_URL);
  console.log();

  // 2. Load tasks
  console.log('Step 2: Loading MedAgentBench tasks...');
  const rawTasks = await loadMedAgentBenchTasks();
  const allTasks: MedAgentTask[] = rawTasks.map(t => ({
    id: t.task_id,
    patient_id: t.patient_id,
    instruction: t.instruction,
    context: t.context,
    sol: t.sol,
  }));
  const tasks = SAMPLES > 0 ? allTasks.slice(0, SAMPLES) : allTasks;
  console.log(`  Loaded ${allTasks.length} tasks, running ${tasks.length}\n`);

  // 3. Run agent on each task
  console.log(`Step 3: Running agent on ${tasks.length} tasks (concurrency=${CONCURRENCY})...`);
  const fhirClient = new FHIRClient(FHIR_BASE_URL);
  const results: TaskResult[] = new Array(tasks.length);

  await runWithConcurrency(tasks, CONCURRENCY, async (task, i) => {
    const tag = `[${i + 1}/${tasks.length}]`;
    const start = Date.now();
    try {
      const agentResult = await runAgentLoop(task, fhirClient, MODEL, MAX_ROUNDS);
      const evalResult = await evaluateTask(task, agentResult, fhirClient);
      evalResult.durationMs = Date.now() - start;
      results[i] = evalResult;

      const status = evalResult.pass ? 'PASS' : 'FAIL';
      console.log(
        `  ${tag} ${status} ${task.id} (${evalResult.category}) — ` +
        `rounds=${agentResult.rounds}, ${evalResult.evaluationDetail.slice(0, 80)}`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results[i] = {
        taskId: task.id,
        category: getTaskCategory(task.id),
        taskType: getTaskType(task.id),
        pass: false,
        agent: { answer: null, rounds: 0, toolCalls: [], timedOut: false, error: errMsg },
        expected: task.sol,
        evaluationDetail: `Error: ${errMsg}`,
        durationMs: Date.now() - start,
      };
      console.log(`  ${tag} ERROR ${task.id} — ${errMsg}`);
    }
  });

  // 4. Aggregate metrics
  console.log('\nStep 4: Aggregating results...');

  const passed = results.filter(r => r.pass);
  const retrieval = results.filter(r => r.taskType === 'retrieval');
  const write = results.filter(r => r.taskType === 'write');
  const conditional = results.filter(r => r.taskType === 'conditional');

  // Per-category pass rates
  const categoryPassRates: Record<TaskCategory, number> = {} as Record<TaskCategory, number>;
  for (const [numStr, info] of Object.entries(CATEGORY_MAP)) {
    const catResults = results.filter(r => r.category === info.category);
    categoryPassRates[info.category] = catResults.length > 0
      ? catResults.filter(r => r.pass).length / catResults.length
      : 0;
  }

  const metrics: MedAgentMetrics = {
    medagent_overall_pass_rate: results.length > 0 ? passed.length / results.length : 0,
    medagent_retrieval_pass_rate: retrieval.length > 0 ? retrieval.filter(r => r.pass).length / retrieval.length : 0,
    medagent_write_pass_rate: write.length > 0 ? write.filter(r => r.pass).length / write.length : 0,
    medagent_conditional_pass_rate: conditional.length > 0 ? conditional.filter(r => r.pass).length / conditional.length : 0,
    medagent_patient_lookup: categoryPassRates.patient_lookup ?? 0,
    medagent_age_calculation: categoryPassRates.age_calculation ?? 0,
    medagent_vital_recording: categoryPassRates.vital_recording ?? 0,
    medagent_lab_retrieval: categoryPassRates.lab_retrieval ?? 0,
    medagent_conditional_medication: categoryPassRates.conditional_medication ?? 0,
    medagent_average_calculation: categoryPassRates.average_calculation ?? 0,
    medagent_recent_value: categoryPassRates.recent_value ?? 0,
    medagent_referral_order: categoryPassRates.referral_order ?? 0,
    medagent_conditional_electrolyte: categoryPassRates.conditional_electrolyte ?? 0,
    medagent_conditional_lab: categoryPassRates.conditional_lab ?? 0,
  };

  // 5. Print results table
  const tableResults = [
    { name: 'Overall pass rate', pass: metrics.medagent_overall_pass_rate >= THRESHOLDS.overall, metric: 'rate', value: metrics.medagent_overall_pass_rate, threshold: THRESHOLDS.overall },
    { name: 'Retrieval pass rate', pass: metrics.medagent_retrieval_pass_rate >= THRESHOLDS.retrieval, metric: 'rate', value: metrics.medagent_retrieval_pass_rate, threshold: THRESHOLDS.retrieval },
    { name: 'Write pass rate', pass: metrics.medagent_write_pass_rate >= THRESHOLDS.write, metric: 'rate', value: metrics.medagent_write_pass_rate, threshold: THRESHOLDS.write },
    { name: 'Conditional pass rate', pass: true, metric: 'rate', value: metrics.medagent_conditional_pass_rate },
    { name: '─── Per Category ───', pass: true, metric: '', value: 0 },
    { name: 'Patient Lookup', pass: true, metric: 'rate', value: metrics.medagent_patient_lookup },
    { name: 'Age Calculation', pass: true, metric: 'rate', value: metrics.medagent_age_calculation },
    { name: 'Vital Recording', pass: true, metric: 'rate', value: metrics.medagent_vital_recording },
    { name: 'Lab Retrieval', pass: true, metric: 'rate', value: metrics.medagent_lab_retrieval },
    { name: 'Conditional Medication', pass: true, metric: 'rate', value: metrics.medagent_conditional_medication },
    { name: 'Average Calculation', pass: true, metric: 'rate', value: metrics.medagent_average_calculation },
    { name: 'Recent Value', pass: true, metric: 'rate', value: metrics.medagent_recent_value },
    { name: 'Referral Order', pass: true, metric: 'rate', value: metrics.medagent_referral_order },
    { name: 'Conditional Electrolyte', pass: true, metric: 'rate', value: metrics.medagent_conditional_electrolyte },
    { name: 'Conditional Lab', pass: true, metric: 'rate', value: metrics.medagent_conditional_lab },
    { name: `Tasks evaluated (${passed.length}/${results.length})`, pass: passed.length > 0, metric: 'count', value: passed.length },
  ];

  printResultsTable(tableResults);

  // 6. Reference comparison
  console.log('--- Reference Comparison ---');
  console.log(`  GPT-4o (published):           72.0%`);
  console.log(`  Claude 3.5 Sonnet (published): 69.7%`);
  console.log(`  This run (${MODEL}):  ${(metrics.medagent_overall_pass_rate * 100).toFixed(1)}%`);
  console.log();

  // 7. Save results
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = join(resultsDir, `medagentbench-${timestamp}.json`);
  const output = {
    timestamp: new Date().toISOString(),
    config: { model: MODEL, taskCount: tasks.length, concurrency: CONCURRENCY, maxRounds: MAX_ROUNDS },
    thresholds: THRESHOLDS,
    metrics,
    passCount: passed.length,
    failCount: results.length - passed.length,
    totalTasks: results.length,
    avgDurationMs: avg(results.map(r => r.durationMs)),
    avgRounds: avg(results.map(r => r.agent.rounds)),
    results: results.map(r => ({
      taskId: r.taskId,
      category: r.category,
      taskType: r.taskType,
      pass: r.pass,
      expected: r.expected,
      answer: r.agent.answer,
      rounds: r.agent.rounds,
      toolCallCount: r.agent.toolCalls.length,
      evaluationDetail: r.evaluationDetail,
      durationMs: r.durationMs,
    })),
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Results saved to ${outputPath}`);

  // 8. Show worst-performing categories
  const failedByCategory = results.filter(r => !r.pass);
  if (failedByCategory.length > 0) {
    console.log('\n--- Failed Tasks (up to 10) ---');
    for (const r of failedByCategory.slice(0, 10)) {
      console.log(`  ${r.taskId} (${r.category}): ${r.evaluationDetail.slice(0, 100)}`);
    }
    console.log();
  }

  // 9. Exit code
  const anyFail = metrics.medagent_overall_pass_rate < THRESHOLDS.overall
    || metrics.medagent_retrieval_pass_rate < THRESHOLDS.retrieval
    || metrics.medagent_write_pass_rate < THRESHOLDS.write;

  if (anyFail) {
    console.log('BENCHMARK FAILED — one or more metrics below threshold.\n');
    process.exit(1);
  } else {
    console.log('BENCHMARK PASSED — all metrics meet thresholds.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('MedAgentBench crashed:', err);
  process.exit(2);
});
