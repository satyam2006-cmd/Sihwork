import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Simple evaluation metrics for extraction quality.
 */

/**
 * Compute word-level overlap (simplified ROUGE-1 recall).
 */
export function rougeScore(reference: string, candidate: string): number {
  if (!reference || !candidate) return 0;

  const refWords = new Set(reference.toLowerCase().split(/\s+/).filter(Boolean));
  const candWords = new Set(candidate.toLowerCase().split(/\s+/).filter(Boolean));

  if (refWords.size === 0) return 0;

  let overlap = 0;
  for (const word of candWords) {
    if (refWords.has(word)) overlap++;
  }

  return overlap / refWords.size;
}

/**
 * Check which expected fields are present in an extraction result.
 * Returns the fraction of expected fields that are non-null/non-empty.
 */
export function fieldCoverage(
  result: Record<string, unknown>,
  expectedFields: string[],
): { coverage: number; missing: string[] } {
  const missing: string[] = [];

  for (const field of expectedFields) {
    const value = result[field];
    if (value === null || value === undefined || value === '' ||
        (Array.isArray(value) && value.length === 0)) {
      missing.push(field);
    }
  }

  const coverage = (expectedFields.length - missing.length) / expectedFields.length;
  return { coverage, missing };
}

/**
 * Print a summary table of test results.
 */
export function printResultsTable(
  results: Array<{
    name: string;
    pass: boolean;
    metric?: string;
    value?: number;
    threshold?: number;
    details?: string;
  }>,
): void {
  console.log('\n' + '='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    const metricStr = r.metric && r.value !== undefined
      ? ` (${r.metric}: ${r.value.toFixed(3)}${r.threshold !== undefined ? ` / threshold: ${r.threshold}` : ''})`
      : '';
    console.log(`  [${status}] ${r.name}${metricStr}`);
    if (r.details) console.log(`         ${r.details}`);
    if (r.pass) passed++;
    else failed++;
  }

  console.log('='.repeat(80));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(80) + '\n');
}

// ---------------------------------------------------------------------------
// Baseline comparison utilities
// ---------------------------------------------------------------------------

const BASELINE_PATH = join(__dirname, '..', 'results', 'baseline.json');

export interface Baseline {
  timestamp: string;
  metrics: Record<string, number>;
}

export interface MetricDelta {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  arrow: string;
}

export function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveBaseline(metrics: Record<string, number>): void {
  const dir = dirname(BASELINE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const baseline: Baseline = {
    timestamp: new Date().toISOString(),
    metrics,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`Baseline saved to ${BASELINE_PATH}`);
}

export function compareWithBaseline(
  current: Record<string, number>,
  baseline: Baseline,
): { deltas: MetricDelta[]; improvements: number; regressions: number; unchanged: number } {
  const deltas: MetricDelta[] = [];
  let improvements = 0;
  let regressions = 0;
  let unchanged = 0;

  const allKeys = new Set([...Object.keys(current), ...Object.keys(baseline.metrics)]);
  for (const metric of allKeys) {
    const baseVal = baseline.metrics[metric] ?? 0;
    const curVal = current[metric] ?? 0;
    const delta = curVal - baseVal;
    const threshold = 0.005; // treat < 0.5% change as unchanged

    let arrow: string;
    if (Math.abs(delta) < threshold) {
      arrow = '=';
      unchanged++;
    } else if (delta > 0) {
      arrow = '\u2191'; // ↑
      improvements++;
    } else {
      arrow = '\u2193'; // ↓
      regressions++;
    }

    deltas.push({ metric, baseline: baseVal, current: curVal, delta, arrow });
  }

  return { deltas, improvements, regressions, unchanged };
}

export function printComparisonTable(
  deltas: MetricDelta[],
  baselineTimestamp: string,
  stats: { improvements: number; regressions: number; unchanged: number },
): void {
  console.log('\n' + '='.repeat(80));
  console.log(`BASELINE COMPARISON (baseline from ${baselineTimestamp})`);
  console.log('='.repeat(80));

  // Column headers
  const metricWidth = 35;
  const numWidth = 10;
  console.log(
    '  ' +
    'Metric'.padEnd(metricWidth) +
    'Baseline'.padStart(numWidth) +
    'Current'.padStart(numWidth) +
    'Delta'.padStart(numWidth) +
    '  ' +
    '',
  );
  console.log('  ' + '-'.repeat(metricWidth + numWidth * 3 + 4));

  for (const d of deltas) {
    const isRegression = d.arrow === '\u2193' && Math.abs(d.delta) > 0.05;
    const suffix = isRegression ? ' !! REGRESSION' : '';
    console.log(
      '  ' +
      d.metric.padEnd(metricWidth) +
      d.baseline.toFixed(3).padStart(numWidth) +
      d.current.toFixed(3).padStart(numWidth) +
      ((d.delta >= 0 ? '+' : '') + d.delta.toFixed(3)).padStart(numWidth) +
      '  ' +
      d.arrow +
      suffix,
    );
  }

  console.log('  ' + '-'.repeat(metricWidth + numWidth * 3 + 4));
  console.log(`  Improvements: ${stats.improvements} | Regressions: ${stats.regressions} | Unchanged: ${stats.unchanged}`);
  console.log('='.repeat(80) + '\n');
}
