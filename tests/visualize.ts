import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkResult {
  timestamp: string;
  config: { model?: string; hardSampleCount: number; conversationEvalCount: number };
  thresholds: Record<string, number>;
  metrics: Record<string, number>;
  successCount: number;
  errorCount: number;
}

interface MedXpertQAResult {
  timestamp: string;
  config: { model?: string; sampleCount: number; concurrency: number };
  thresholds: Record<string, number>;
  metrics: Record<string, number>;
  correctCount: number;
  totalCount: number;
  errorCount: number;
  breakdowns: {
    byTask: Record<string, { accuracy: number; count: number }>;
    byType: Record<string, { accuracy: number; count: number }>;
    bySystem: Record<string, { accuracy: number; count: number }>;
  };
}

interface MedAgentBenchResult {
  timestamp: string;
  config: { model?: string; taskCount: number; concurrency: number; maxRounds: number };
  thresholds: Record<string, number>;
  metrics: Record<string, number>;
  passCount: number;
  failCount: number;
  totalTasks: number;
  avgDurationMs: number;
  avgRounds: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RESULTS_DIR = join(__dirname, 'results');

const METRIC_LABELS: Record<string, string> = {
  extraction_faithfulness: 'Faithfulness',
  extraction_completeness: 'Completeness',
  extraction_correctness: 'Correctness',
  extraction_consistency: 'Consistency',
  extraction_overall: 'Overall Confidence',
  field_coverage: 'Field Coverage',
  rouge_vs_soap: 'ROUGE vs SOAP',
  conversation_thoroughness: 'Thoroughness',
  conversation_empathy: 'Empathy',
  conversation_safety: 'Safety',
  conversation_accuracy: 'Accuracy',
  conversation_follow_up: 'Follow-up Quality',
  conversation_overall: 'Overall Quality',
};

const METRIC_CATEGORIES: Record<string, string[]> = {
  'Extraction Quality': [
    'extraction_faithfulness',
    'extraction_completeness',
    'extraction_correctness',
    'extraction_consistency',
    'extraction_overall',
  ],
  'Data Coverage': [
    'field_coverage',
    'rouge_vs_soap',
  ],
  'Conversation Quality': [
    'conversation_thoroughness',
    'conversation_empathy',
    'conversation_safety',
    'conversation_accuracy',
    'conversation_follow_up',
    'conversation_overall',
  ],
};

// ---------------------------------------------------------------------------
// MedAgentBench configuration
// ---------------------------------------------------------------------------

const MEDAGENT_METRIC_LABELS: Record<string, string> = {
  medagent_overall_pass_rate: 'Overall',
  medagent_retrieval_pass_rate: 'Retrieval',
  medagent_write_pass_rate: 'Write',
  medagent_conditional_pass_rate: 'Conditional',
  medagent_patient_lookup: 'Patient Lookup',
  medagent_age_calculation: 'Age Calculation',
  medagent_vital_recording: 'Vital Recording',
  medagent_lab_retrieval: 'Lab Retrieval',
  medagent_conditional_medication: 'Cond. Medication',
  medagent_average_calculation: 'Average Calc',
  medagent_recent_value: 'Recent Value',
  medagent_referral_order: 'Referral Order',
  medagent_conditional_electrolyte: 'Cond. Electrolyte',
  medagent_conditional_lab: 'Cond. Lab',
};

const MEDAGENT_CATEGORIES: Record<string, string[]> = {
  'Overall MedAgentBench': [
    'medagent_overall_pass_rate',
    'medagent_retrieval_pass_rate',
    'medagent_write_pass_rate',
    'medagent_conditional_pass_rate',
  ],
  'Retrieval Tasks': [
    'medagent_patient_lookup',
    'medagent_age_calculation',
    'medagent_lab_retrieval',
    'medagent_average_calculation',
    'medagent_recent_value',
  ],
  'Write / Conditional Tasks': [
    'medagent_vital_recording',
    'medagent_conditional_medication',
    'medagent_referral_order',
    'medagent_conditional_electrolyte',
    'medagent_conditional_lab',
  ],
};

// ---------------------------------------------------------------------------
// MedXpertQA configuration
// ---------------------------------------------------------------------------

const MEDXPERT_METRIC_LABELS: Record<string, string> = {
  medxpert_overall: 'Overall',
  medxpert_basic_science: 'Basic Science',
  medxpert_diagnosis: 'Diagnosis',
  medxpert_treatment: 'Treatment',
  medxpert_reasoning: 'Reasoning',
  medxpert_understanding: 'Understanding',
  medxpert_skeletal: 'Skeletal',
  medxpert_cardiovascular: 'Cardiovascular',
  medxpert_respiratory: 'Respiratory',
  medxpert_nervous: 'Nervous',
  medxpert_digestive: 'Digestive',
  medxpert_reproductive: 'Reproductive',
  medxpert_muscular: 'Muscular',
  medxpert_endocrine: 'Endocrine',
  medxpert_lymphatic: 'Lymphatic',
  medxpert_integumentary: 'Integumentary',
  medxpert_urinary: 'Urinary',
  medxpert_other: 'Other',
};

const MEDXPERT_CATEGORIES: Record<string, string[]> = {
  'Overall & Task Type': [
    'medxpert_overall',
    'medxpert_basic_science',
    'medxpert_diagnosis',
    'medxpert_treatment',
  ],
  'Question Type': [
    'medxpert_reasoning',
    'medxpert_understanding',
  ],
  'Body Systems': [
    'medxpert_skeletal',
    'medxpert_cardiovascular',
    'medxpert_respiratory',
    'medxpert_nervous',
    'medxpert_digestive',
    'medxpert_reproductive',
    'medxpert_muscular',
    'medxpert_endocrine',
    'medxpert_lymphatic',
    'medxpert_integumentary',
    'medxpert_urinary',
    'medxpert_other',
  ],
};

// ---------------------------------------------------------------------------
// Load results
// ---------------------------------------------------------------------------

function loadResults(): BenchmarkResult[] {
  const args = process.argv.slice(2);
  const compareAll = args.includes('--compare');
  const specificFiles = args.filter(a => a.endsWith('.json'));

  if (!existsSync(RESULTS_DIR)) {
    console.error('No results directory found. Run `npm run test:benchmark` first.');
    process.exit(1);
  }

  const allFiles = readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('benchmark-') && f.endsWith('.json'))
    .sort();

  if (allFiles.length === 0) {
    console.error('No benchmark results found. Run `npm run test:benchmark` first.');
    process.exit(1);
  }

  let filesToLoad: string[];
  if (specificFiles.length > 0) {
    filesToLoad = specificFiles.map(f => f.includes('/') ? f : join(RESULTS_DIR, f));
  } else if (compareAll) {
    // Last 5 runs for comparison
    filesToLoad = allFiles.slice(-5).map(f => join(RESULTS_DIR, f));
  } else {
    // Just the latest
    filesToLoad = [join(RESULTS_DIR, allFiles[allFiles.length - 1])];
  }

  return filesToLoad.map(f => {
    const data = JSON.parse(readFileSync(f, 'utf-8')) as BenchmarkResult;
    return data;
  });
}

// ---------------------------------------------------------------------------
// Generate HTML
// ---------------------------------------------------------------------------

function getRunLabel(result: BenchmarkResult): string {
  const model = result.config.model || 'claude-sonnet-4-5';
  const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
  const date = new Date(result.timestamp);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${shortModel} (${dateStr})`;
}

function generateHTML(results: BenchmarkResult[]): string {
  const isComparison = results.length > 1;
  const latest = results[results.length - 1];
  const thresholds = latest.thresholds;

  // Color palette for multiple runs
  const RUN_COLORS = [
    { bg: 'rgba(59, 130, 246, 0.75)', border: 'rgb(59, 130, 246)' },   // blue
    { bg: 'rgba(16, 185, 129, 0.75)', border: 'rgb(16, 185, 129)' },   // green
    { bg: 'rgba(245, 158, 11, 0.75)', border: 'rgb(245, 158, 11)' },   // amber
    { bg: 'rgba(139, 92, 246, 0.75)', border: 'rgb(139, 92, 246)' },   // purple
    { bg: 'rgba(239, 68, 68, 0.75)', border: 'rgb(239, 68, 68)' },     // red
  ];

  // Category colors for single-run mode
  const CATEGORY_COLORS: Record<string, { bg: string; border: string }> = {
    'Extraction Quality': { bg: 'rgba(59, 130, 246, 0.75)', border: 'rgb(59, 130, 246)' },
    'Data Coverage': { bg: 'rgba(245, 158, 11, 0.75)', border: 'rgb(245, 158, 11)' },
    'Conversation Quality': { bg: 'rgba(16, 185, 129, 0.75)', border: 'rgb(16, 185, 129)' },
  };

  // Build chart data per category
  const chartConfigs: string[] = [];
  let chartIndex = 0;

  for (const [category, metricKeys] of Object.entries(METRIC_CATEGORIES)) {
    const labels = metricKeys.map(k => METRIC_LABELS[k] || k);
    const canvasId = `chart-${chartIndex}`;

    let datasets: string;
    if (isComparison) {
      // Multi-run: one dataset per run
      datasets = results.map((r, ri) => {
        const color = RUN_COLORS[ri % RUN_COLORS.length];
        const data = metricKeys.map(k => (r.metrics[k] ?? 0).toFixed(4));
        return `{
          label: ${JSON.stringify(getRunLabel(r))},
          data: [${data.join(',')}],
          backgroundColor: '${color.bg}',
          borderColor: '${color.border}',
          borderWidth: 1.5,
          borderRadius: 4,
        }`;
      }).join(',\n          ');
    } else {
      // Single run: color by pass/fail
      const r = results[0];
      const bgColors = metricKeys.map(k => {
        const val = r.metrics[k] ?? 0;
        const thresh = thresholds[k];
        if (thresh !== undefined) {
          return val >= thresh ? "'rgba(16, 185, 129, 0.75)'" : "'rgba(239, 68, 68, 0.75)'";
        }
        const catColor = CATEGORY_COLORS[category];
        return `'${catColor.bg}'`;
      });
      const borderColors = metricKeys.map(k => {
        const val = r.metrics[k] ?? 0;
        const thresh = thresholds[k];
        if (thresh !== undefined) {
          return val >= thresh ? "'rgb(16, 185, 129)'" : "'rgb(239, 68, 68)'";
        }
        const catColor = CATEGORY_COLORS[category];
        return `'${catColor.border}'`;
      });
      const data = metricKeys.map(k => (r.metrics[k] ?? 0).toFixed(4));
      datasets = `{
          label: ${JSON.stringify(getRunLabel(r))},
          data: [${data.join(',')}],
          backgroundColor: [${bgColors.join(',')}],
          borderColor: [${borderColors.join(',')}],
          borderWidth: 1.5,
          borderRadius: 4,
        }`;
    }

    // Threshold annotations
    const annotations: string[] = [];
    for (const k of metricKeys) {
      if (thresholds[k] !== undefined) {
        annotations.push(`{
          type: 'line',
          yMin: ${thresholds[k]},
          yMax: ${thresholds[k]},
          borderColor: 'rgba(239, 68, 68, 0.6)',
          borderWidth: 2,
          borderDash: [6, 4],
          label: {
            display: true,
            content: 'Threshold: ${thresholds[k]}',
            position: 'end',
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            color: '#fff',
            font: { size: 10, weight: 'bold' },
            padding: 3,
          }
        }`);
        break; // Only show one threshold line per chart (they tend to be the same within category)
      }
    }

    // Per-metric threshold markers
    const thresholdDataPoints = metricKeys.map(k =>
      thresholds[k] !== undefined ? thresholds[k].toString() : 'null'
    );
    const hasThresholds = metricKeys.some(k => thresholds[k] !== undefined);

    if (hasThresholds) {
      datasets += `,{
          label: 'Threshold',
          data: [${thresholdDataPoints.join(',')}],
          type: 'line',
          borderColor: 'rgba(239, 68, 68, 0.7)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointBackgroundColor: 'rgba(239, 68, 68, 0.9)',
          pointRadius: 5,
          pointStyle: 'crossRot',
          fill: false,
          order: 0,
          spanGaps: true,
        }`;
    }

    chartConfigs.push(`
      new Chart(document.getElementById('${canvasId}'), {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [${datasets}]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 1,
              ticks: {
                callback: v => (v * 100).toFixed(0) + '%',
                font: { size: 12 },
              },
              grid: { color: 'rgba(0,0,0,0.06)' },
            },
            x: {
              ticks: { font: { size: 12, weight: '500' } },
              grid: { display: false },
            }
          },
          plugins: {
            legend: { display: ${isComparison || hasThresholds}, position: 'top' },
            title: {
              display: true,
              text: '${category}',
              font: { size: 18, weight: '600' },
              padding: { bottom: 16 },
            },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + (ctx.raw * 100).toFixed(1) + '%',
              }
            },
          },
        }
      });
    `);
    chartIndex++;
  }

  // Summary stats
  const metricEntries = Object.entries(latest.metrics);
  const passCount = metricEntries.filter(([k, v]) => thresholds[k] === undefined || v >= thresholds[k]).length;
  const failCount = metricEntries.filter(([k, v]) => thresholds[k] !== undefined && v < thresholds[k]).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Second Opinion AI — Benchmark Results</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }
    .subtitle {
      color: #64748b;
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }
    .stats-row {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      min-width: 160px;
      flex: 1;
    }
    .stat-card .label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
    .stat-card .value.pass { color: #10b981; }
    .stat-card .value.fail { color: #ef4444; }
    .stat-card .value.neutral { color: #3b82f6; }
    .chart-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .chart-container { position: relative; height: 360px; }
    .metric-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      font-size: 0.875rem;
    }
    .metric-table th {
      text-align: left;
      padding: 0.625rem 1rem;
      background: #f1f5f9;
      font-weight: 600;
      border-bottom: 2px solid #e2e8f0;
    }
    .metric-table td {
      padding: 0.5rem 1rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .metric-table tr:hover td { background: #f8fafc; }
    .badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge.pass { background: #d1fae5; color: #065f46; }
    .badge.fail { background: #fee2e2; color: #991b1b; }
    .badge.none { background: #f1f5f9; color: #64748b; }
    footer {
      margin-top: 2rem;
      text-align: center;
      color: #94a3b8;
      font-size: 0.8rem;
    }
    .rerun-hint {
      margin-top: 1rem;
      padding: 1rem;
      background: #eff6ff;
      border-radius: 8px;
      font-size: 0.85rem;
      color: #1e40af;
    }
    .rerun-hint code {
      background: #dbeafe;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Second Opinion AI — Benchmark Results</h1>
    <p class="subtitle">
      ${isComparison ? `Comparing ${results.length} runs` : `Model: ${latest.config.model || 'claude-sonnet-4-5-20250929'}`}
      &middot; ${new Date(latest.timestamp).toLocaleString()}
      &middot; ${latest.config.hardSampleCount} hard samples, ${latest.config.conversationEvalCount} conversation evals
    </p>

    <div class="stats-row">
      <div class="stat-card">
        <div class="label">Metrics Passing</div>
        <div class="value pass">${passCount} / ${metricEntries.length}</div>
      </div>
      <div class="stat-card">
        <div class="label">Metrics Failing</div>
        <div class="value ${failCount > 0 ? 'fail' : 'pass'}">${failCount}</div>
      </div>
      <div class="stat-card">
        <div class="label">Samples OK</div>
        <div class="value neutral">${latest.successCount}</div>
      </div>
      <div class="stat-card">
        <div class="label">Samples Errored</div>
        <div class="value ${latest.errorCount > 0 ? 'fail' : 'pass'}">${latest.errorCount}</div>
      </div>
    </div>

    ${Object.keys(METRIC_CATEGORIES).map((_, i) => `
    <div class="chart-card">
      <div class="chart-container">
        <canvas id="chart-${i}"></canvas>
      </div>
    </div>`).join('\n')}

    <div class="chart-card">
      <h2 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.75rem;">All Metrics</h2>
      <table class="metric-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Category</th>
            <th>Score</th>
            <th>Threshold</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(METRIC_CATEGORIES).flatMap(([cat, keys]) =>
            keys.map(k => {
              const val = latest.metrics[k] ?? 0;
              const thresh = thresholds[k];
              const pass = thresh === undefined ? null : val >= thresh;
              const badge = pass === null ? '<span class="badge none">N/A</span>'
                : pass ? '<span class="badge pass">PASS</span>'
                : '<span class="badge fail">FAIL</span>';
              return `<tr>
                <td><strong>${METRIC_LABELS[k] || k}</strong></td>
                <td>${cat}</td>
                <td>${(val * 100).toFixed(1)}%</td>
                <td>${thresh !== undefined ? (thresh * 100).toFixed(0) + '%' : '—'}</td>
                <td>${badge}</td>
              </tr>`;
            })
          ).join('\n          ')}
        </tbody>
      </table>
    </div>

    <div class="rerun-hint">
      <strong>Rerun benchmarks:</strong><br>
      <code>npm run test:benchmark</code> — run with default model (Sonnet 4.5)<br>
      <code>BENCHMARK_MODEL=claude-haiku-4-5-20251001 npm run test:benchmark</code> — run with a different model<br>
      <code>BENCHMARK_SAMPLES=10 npm run test:benchmark</code> — quick run with fewer samples<br>
      <code>npm run test:visualize</code> — regenerate this chart from latest results<br>
      <code>npm run test:visualize -- --compare</code> — compare last 5 runs
    </div>

    <footer>
      Generated ${new Date().toLocaleString()} &middot; Second Opinion AI Benchmark Suite
    </footer>
  </div>

  <script>
    ${chartConfigs.join('\n')}
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// MedAgentBench results loading
// ---------------------------------------------------------------------------

function loadMedAgentBenchResults(): MedAgentBenchResult[] {
  const args = process.argv.slice(2);
  const compareAll = args.includes('--compare');
  const specificFiles = args.filter(a => a.endsWith('.json'));

  if (!existsSync(RESULTS_DIR)) {
    console.error('No results directory found. Run `npm run test:medagentbench` first.');
    process.exit(1);
  }

  const allFiles = readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('medagentbench-') && f.endsWith('.json'))
    .sort();

  if (allFiles.length === 0) {
    console.error('No MedAgentBench results found. Run `npm run test:medagentbench` first.');
    process.exit(1);
  }

  let filesToLoad: string[];
  if (specificFiles.length > 0) {
    filesToLoad = specificFiles.map(f => f.includes('/') ? f : join(RESULTS_DIR, f));
  } else if (compareAll) {
    filesToLoad = allFiles.slice(-5).map(f => join(RESULTS_DIR, f));
  } else {
    filesToLoad = [join(RESULTS_DIR, allFiles[allFiles.length - 1])];
  }

  return filesToLoad.map(f => JSON.parse(readFileSync(f, 'utf-8')) as MedAgentBenchResult);
}

// ---------------------------------------------------------------------------
// MedAgentBench HTML generation
// ---------------------------------------------------------------------------

function generateMedAgentBenchHTML(results: MedAgentBenchResult[]): string {
  const isComparison = results.length > 1;
  const latest = results[results.length - 1];
  const thresholds = latest.thresholds;

  const RUN_COLORS = [
    { bg: 'rgba(59, 130, 246, 0.75)', border: 'rgb(59, 130, 246)' },
    { bg: 'rgba(16, 185, 129, 0.75)', border: 'rgb(16, 185, 129)' },
    { bg: 'rgba(245, 158, 11, 0.75)', border: 'rgb(245, 158, 11)' },
    { bg: 'rgba(139, 92, 246, 0.75)', border: 'rgb(139, 92, 246)' },
    { bg: 'rgba(239, 68, 68, 0.75)', border: 'rgb(239, 68, 68)' },
  ];

  const CATEGORY_COLORS: Record<string, { bg: string; border: string }> = {
    'Overall MedAgentBench': { bg: 'rgba(59, 130, 246, 0.75)', border: 'rgb(59, 130, 246)' },
    'Retrieval Tasks': { bg: 'rgba(16, 185, 129, 0.75)', border: 'rgb(16, 185, 129)' },
    'Write / Conditional Tasks': { bg: 'rgba(245, 158, 11, 0.75)', border: 'rgb(245, 158, 11)' },
  };

  const chartConfigs: string[] = [];
  let chartIndex = 0;

  for (const [category, metricKeys] of Object.entries(MEDAGENT_CATEGORIES)) {
    const labels = metricKeys.map(k => MEDAGENT_METRIC_LABELS[k] || k);
    const canvasId = `chart-${chartIndex}`;

    let datasets: string;
    if (isComparison) {
      datasets = results.map((r, ri) => {
        const color = RUN_COLORS[ri % RUN_COLORS.length];
        const data = metricKeys.map(k => (r.metrics[k] ?? 0).toFixed(4));
        const model = r.config.model || 'claude-sonnet-4-5';
        const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
        const date = new Date(r.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `{
          label: ${JSON.stringify(`${shortModel} (${dateStr})`)},
          data: [${data.join(',')}],
          backgroundColor: '${color.bg}',
          borderColor: '${color.border}',
          borderWidth: 1.5,
          borderRadius: 4,
        }`;
      }).join(',\n          ');
    } else {
      const r = results[0];
      const bgColors = metricKeys.map(k => {
        const val = r.metrics[k] ?? 0;
        const thresh = thresholds[k];
        if (thresh !== undefined) {
          return val >= thresh ? "'rgba(16, 185, 129, 0.75)'" : "'rgba(239, 68, 68, 0.75)'";
        }
        const catColor = CATEGORY_COLORS[category];
        return `'${catColor?.bg || 'rgba(59, 130, 246, 0.75)'}'`;
      });
      const borderColors = metricKeys.map(k => {
        const val = r.metrics[k] ?? 0;
        const thresh = thresholds[k];
        if (thresh !== undefined) {
          return val >= thresh ? "'rgb(16, 185, 129)'" : "'rgb(239, 68, 68)'";
        }
        const catColor = CATEGORY_COLORS[category];
        return `'${catColor?.border || 'rgb(59, 130, 246)'}'`;
      });
      const data = metricKeys.map(k => (r.metrics[k] ?? 0).toFixed(4));
      const model = r.config.model || 'claude-sonnet-4-5';
      const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
      datasets = `{
          label: ${JSON.stringify(shortModel)},
          data: [${data.join(',')}],
          backgroundColor: [${bgColors.join(',')}],
          borderColor: [${borderColors.join(',')}],
          borderWidth: 1.5,
          borderRadius: 4,
        }`;
    }

    // Threshold markers
    const thresholdDataPoints = metricKeys.map(k =>
      thresholds[k] !== undefined ? thresholds[k].toString() : 'null'
    );
    const hasThresholds = metricKeys.some(k => thresholds[k] !== undefined);

    if (hasThresholds) {
      datasets += `,{
          label: 'Threshold',
          data: [${thresholdDataPoints.join(',')}],
          type: 'line',
          borderColor: 'rgba(239, 68, 68, 0.7)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointBackgroundColor: 'rgba(239, 68, 68, 0.9)',
          pointRadius: 5,
          pointStyle: 'crossRot',
          fill: false,
          order: 0,
          spanGaps: true,
        }`;
    }

    chartConfigs.push(`
      new Chart(document.getElementById('${canvasId}'), {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [${datasets}]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 1,
              ticks: {
                callback: v => (v * 100).toFixed(0) + '%',
                font: { size: 12 },
              },
              grid: { color: 'rgba(0,0,0,0.06)' },
            },
            x: {
              ticks: { font: { size: 12, weight: '500' } },
              grid: { display: false },
            }
          },
          plugins: {
            legend: { display: ${isComparison || hasThresholds}, position: 'top' },
            title: {
              display: true,
              text: '${category}',
              font: { size: 18, weight: '600' },
              padding: { bottom: 16 },
            },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + (ctx.raw * 100).toFixed(1) + '%',
              }
            },
          },
        }
      });
    `);
    chartIndex++;
  }

  const passRate = (latest.metrics.medagent_overall_pass_rate * 100).toFixed(1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MedAgentBench — FHIR Agent Evaluation</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 2rem; }
    .stats-row { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .stat-card {
      background: white; border-radius: 12px; padding: 1.25rem 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-width: 140px; flex: 1;
    }
    .stat-card .label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
    .stat-card .value.pass { color: #10b981; }
    .stat-card .value.fail { color: #ef4444; }
    .stat-card .value.neutral { color: #3b82f6; }
    .chart-card {
      background: white; border-radius: 12px; padding: 1.5rem;
      margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .chart-container { position: relative; height: 360px; }
    .metric-table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.875rem; }
    .metric-table th {
      text-align: left; padding: 0.625rem 1rem; background: #f1f5f9;
      font-weight: 600; border-bottom: 2px solid #e2e8f0;
    }
    .metric-table td { padding: 0.5rem 1rem; border-bottom: 1px solid #f1f5f9; }
    .metric-table tr:hover td { background: #f8fafc; }
    .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge.pass { background: #d1fae5; color: #065f46; }
    .badge.fail { background: #fee2e2; color: #991b1b; }
    .badge.none { background: #f1f5f9; color: #64748b; }
    .reference-card {
      background: white; border-radius: 12px; padding: 1.5rem;
      margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .reference-card h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.75rem; }
    .reference-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; }
    .reference-row:last-child { border: none; }
    .reference-row .model { font-weight: 500; }
    .reference-row .score { font-weight: 700; }
    .reference-row .score.highlight { color: #3b82f6; }
    footer { margin-top: 2rem; text-align: center; color: #94a3b8; font-size: 0.8rem; }
    .rerun-hint {
      margin-top: 1rem; padding: 1rem; background: #eff6ff;
      border-radius: 8px; font-size: 0.85rem; color: #1e40af;
    }
    .rerun-hint code {
      background: #dbeafe; padding: 0.125rem 0.375rem;
      border-radius: 4px; font-family: 'SF Mono', Menlo, monospace; font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>MedAgentBench — FHIR Agent Evaluation</h1>
    <p class="subtitle">
      Model: ${latest.config.model || 'claude-sonnet-4-5-20250929'}
      &middot; ${new Date(latest.timestamp).toLocaleString()}
      &middot; ${latest.totalTasks} tasks, avg ${latest.avgRounds.toFixed(1)} rounds/task
    </p>

    <div class="stats-row">
      <div class="stat-card">
        <div class="label">Overall Pass Rate</div>
        <div class="value ${latest.metrics.medagent_overall_pass_rate >= 0.6 ? 'pass' : 'fail'}">${passRate}%</div>
      </div>
      <div class="stat-card">
        <div class="label">Tasks Passed</div>
        <div class="value pass">${latest.passCount} / ${latest.totalTasks}</div>
      </div>
      <div class="stat-card">
        <div class="label">Tasks Failed</div>
        <div class="value ${latest.failCount > 0 ? 'fail' : 'pass'}">${latest.failCount}</div>
      </div>
      <div class="stat-card">
        <div class="label">Avg Duration</div>
        <div class="value neutral">${(latest.avgDurationMs / 1000).toFixed(1)}s</div>
      </div>
    </div>

    ${Object.keys(MEDAGENT_CATEGORIES).map((_, i) => `
    <div class="chart-card">
      <div class="chart-container">
        <canvas id="chart-${i}"></canvas>
      </div>
    </div>`).join('\n')}

    <div class="reference-card">
      <h2>Published Reference Results</h2>
      <div class="reference-row">
        <span class="model">GPT-4o (MedAgentBench paper)</span>
        <span class="score">72.0%</span>
      </div>
      <div class="reference-row">
        <span class="model">Claude 3.5 Sonnet (MedAgentBench paper)</span>
        <span class="score">69.7%</span>
      </div>
      <div class="reference-row">
        <span class="model">This run (${latest.config.model || 'claude-sonnet-4-5-20250929'})</span>
        <span class="score highlight">${passRate}%</span>
      </div>
    </div>

    <div class="chart-card">
      <h2 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.75rem;">All Metrics</h2>
      <table class="metric-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Category</th>
            <th>Score</th>
            <th>Threshold</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(MEDAGENT_CATEGORIES).flatMap(([cat, keys]) =>
            keys.map(k => {
              const val = latest.metrics[k] ?? 0;
              const thresh = thresholds[k];
              const pass = thresh === undefined ? null : val >= thresh;
              const badge = pass === null ? '<span class="badge none">N/A</span>'
                : pass ? '<span class="badge pass">PASS</span>'
                : '<span class="badge fail">FAIL</span>';
              return `<tr>
                <td><strong>${MEDAGENT_METRIC_LABELS[k] || k}</strong></td>
                <td>${cat}</td>
                <td>${(val * 100).toFixed(1)}%</td>
                <td>${thresh !== undefined ? (thresh * 100).toFixed(0) + '%' : '\\u2014'}</td>
                <td>${badge}</td>
              </tr>`;
            })
          ).join('\n          ')}
        </tbody>
      </table>
    </div>

    <div class="rerun-hint">
      <strong>Rerun MedAgentBench:</strong><br>
      <code>npm run test:medagentbench</code> — full run (300 tasks)<br>
      <code>MEDAGENT_SAMPLES=10 npm run test:medagentbench</code> — quick run with fewer tasks<br>
      <code>npm run test:medagentbench-visualize</code> — regenerate this chart<br>
      <code>npm run test:medagentbench-visualize -- --compare</code> — compare last 5 runs
    </div>

    <footer>
      Generated ${new Date().toLocaleString()} &middot; MedAgentBench (Stanford/NEJM AI)
    </footer>
  </div>

  <script>
    ${chartConfigs.join('\n')}
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// MedXpertQA results loading
// ---------------------------------------------------------------------------

function loadMedXpertQAResults(): MedXpertQAResult[] {
  const args = process.argv.slice(2);
  const compareAll = args.includes('--compare');
  const specificFiles = args.filter(a => a.endsWith('.json'));

  if (!existsSync(RESULTS_DIR)) {
    console.error('No results directory found. Run `npm run test:medxpertqa` first.');
    process.exit(1);
  }

  const allFiles = readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('medxpertqa-') && f.endsWith('.json'))
    .sort();

  if (allFiles.length === 0) {
    console.error('No MedXpertQA results found. Run `npm run test:medxpertqa` first.');
    process.exit(1);
  }

  let filesToLoad: string[];
  if (specificFiles.length > 0) {
    filesToLoad = specificFiles.map(f => f.includes('/') ? f : join(RESULTS_DIR, f));
  } else if (compareAll) {
    filesToLoad = allFiles.slice(-5).map(f => join(RESULTS_DIR, f));
  } else {
    filesToLoad = [join(RESULTS_DIR, allFiles[allFiles.length - 1])];
  }

  return filesToLoad.map(f => JSON.parse(readFileSync(f, 'utf-8')) as MedXpertQAResult);
}

// ---------------------------------------------------------------------------
// MedXpertQA HTML generation
// ---------------------------------------------------------------------------

function generateMedXpertQAHTML(results: MedXpertQAResult[]): string {
  const isComparison = results.length > 1;
  const latest = results[results.length - 1];
  const thresholds = latest.thresholds;

  const RUN_COLORS = [
    { bg: 'rgba(59, 130, 246, 0.75)', border: 'rgb(59, 130, 246)' },
    { bg: 'rgba(16, 185, 129, 0.75)', border: 'rgb(16, 185, 129)' },
    { bg: 'rgba(245, 158, 11, 0.75)', border: 'rgb(245, 158, 11)' },
    { bg: 'rgba(139, 92, 246, 0.75)', border: 'rgb(139, 92, 246)' },
    { bg: 'rgba(239, 68, 68, 0.75)', border: 'rgb(239, 68, 68)' },
  ];

  const CATEGORY_COLORS: Record<string, { bg: string; border: string }> = {
    'Overall & Task Type': { bg: 'rgba(59, 130, 246, 0.75)', border: 'rgb(59, 130, 246)' },
    'Question Type': { bg: 'rgba(16, 185, 129, 0.75)', border: 'rgb(16, 185, 129)' },
    'Body Systems': { bg: 'rgba(245, 158, 11, 0.75)', border: 'rgb(245, 158, 11)' },
  };

  const chartConfigs: string[] = [];
  let chartIndex = 0;

  for (const [category, metricKeys] of Object.entries(MEDXPERT_CATEGORIES)) {
    // Only include metrics that exist in the results
    const availableKeys = metricKeys.filter(k => latest.metrics[k] !== undefined);
    if (availableKeys.length === 0) continue;

    const labels = availableKeys.map(k => MEDXPERT_METRIC_LABELS[k] || k);
    const canvasId = `chart-${chartIndex}`;

    let datasets: string;
    if (isComparison) {
      datasets = results.map((r, ri) => {
        const color = RUN_COLORS[ri % RUN_COLORS.length];
        const data = availableKeys.map(k => (r.metrics[k] ?? 0).toFixed(4));
        const model = r.config.model || 'claude-sonnet-4-5';
        const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
        const date = new Date(r.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `{
          label: ${JSON.stringify(`${shortModel} (${dateStr})`)},
          data: [${data.join(',')}],
          backgroundColor: '${color.bg}',
          borderColor: '${color.border}',
          borderWidth: 1.5,
          borderRadius: 4,
        }`;
      }).join(',\n          ');
    } else {
      const r = results[0];
      const bgColors = availableKeys.map(k => {
        const val = r.metrics[k] ?? 0;
        const thresh = thresholds[k];
        if (thresh !== undefined) {
          return val >= thresh ? "'rgba(16, 185, 129, 0.75)'" : "'rgba(239, 68, 68, 0.75)'";
        }
        const catColor = CATEGORY_COLORS[category];
        return `'${catColor?.bg || 'rgba(59, 130, 246, 0.75)'}'`;
      });
      const borderColors = availableKeys.map(k => {
        const val = r.metrics[k] ?? 0;
        const thresh = thresholds[k];
        if (thresh !== undefined) {
          return val >= thresh ? "'rgb(16, 185, 129)'" : "'rgb(239, 68, 68)'";
        }
        const catColor = CATEGORY_COLORS[category];
        return `'${catColor?.border || 'rgb(59, 130, 246)'}'`;
      });
      const data = availableKeys.map(k => (r.metrics[k] ?? 0).toFixed(4));
      const model = r.config.model || 'claude-sonnet-4-5';
      const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
      datasets = `{
          label: ${JSON.stringify(shortModel)},
          data: [${data.join(',')}],
          backgroundColor: [${bgColors.join(',')}],
          borderColor: [${borderColors.join(',')}],
          borderWidth: 1.5,
          borderRadius: 4,
        }`;
    }

    // Threshold markers
    const thresholdDataPoints = availableKeys.map(k =>
      thresholds[k] !== undefined ? thresholds[k].toString() : 'null'
    );
    const hasThresholds = availableKeys.some(k => thresholds[k] !== undefined);

    if (hasThresholds) {
      datasets += `,{
          label: 'Threshold',
          data: [${thresholdDataPoints.join(',')}],
          type: 'line',
          borderColor: 'rgba(239, 68, 68, 0.7)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointBackgroundColor: 'rgba(239, 68, 68, 0.9)',
          pointRadius: 5,
          pointStyle: 'crossRot',
          fill: false,
          order: 0,
          spanGaps: true,
        }`;
    }

    chartConfigs.push(`
      new Chart(document.getElementById('${canvasId}'), {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [${datasets}]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 1,
              ticks: {
                callback: v => (v * 100).toFixed(0) + '%',
                font: { size: 12 },
              },
              grid: { color: 'rgba(0,0,0,0.06)' },
            },
            x: {
              ticks: { font: { size: 12, weight: '500' } },
              grid: { display: false },
            }
          },
          plugins: {
            legend: { display: ${isComparison || hasThresholds}, position: 'top' },
            title: {
              display: true,
              text: '${category}',
              font: { size: 18, weight: '600' },
              padding: { bottom: 16 },
            },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + (ctx.raw * 100).toFixed(1) + '%',
              }
            },
          },
        }
      });
    `);
    chartIndex++;
  }

  const overallAcc = (latest.metrics.medxpert_overall * 100).toFixed(1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MedXpertQA — Expert Medical Reasoning Benchmark</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 2rem; }
    .stats-row { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .stat-card {
      background: white; border-radius: 12px; padding: 1.25rem 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-width: 140px; flex: 1;
    }
    .stat-card .label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
    .stat-card .value.pass { color: #10b981; }
    .stat-card .value.fail { color: #ef4444; }
    .stat-card .value.neutral { color: #3b82f6; }
    .chart-card {
      background: white; border-radius: 12px; padding: 1.5rem;
      margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .chart-container { position: relative; height: 360px; }
    .metric-table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.875rem; }
    .metric-table th {
      text-align: left; padding: 0.625rem 1rem; background: #f1f5f9;
      font-weight: 600; border-bottom: 2px solid #e2e8f0;
    }
    .metric-table td { padding: 0.5rem 1rem; border-bottom: 1px solid #f1f5f9; }
    .metric-table tr:hover td { background: #f8fafc; }
    .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge.pass { background: #d1fae5; color: #065f46; }
    .badge.fail { background: #fee2e2; color: #991b1b; }
    .badge.none { background: #f1f5f9; color: #64748b; }
    .reference-card {
      background: white; border-radius: 12px; padding: 1.5rem;
      margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .reference-card h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.75rem; }
    .reference-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; }
    .reference-row:last-child { border: none; }
    .reference-row .model { font-weight: 500; }
    .reference-row .score { font-weight: 700; }
    .reference-row .score.highlight { color: #3b82f6; }
    footer { margin-top: 2rem; text-align: center; color: #94a3b8; font-size: 0.8rem; }
    .rerun-hint {
      margin-top: 1rem; padding: 1rem; background: #eff6ff;
      border-radius: 8px; font-size: 0.85rem; color: #1e40af;
    }
    .rerun-hint code {
      background: #dbeafe; padding: 0.125rem 0.375rem;
      border-radius: 4px; font-family: 'SF Mono', Menlo, monospace; font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>MedXpertQA — Expert Medical Reasoning Benchmark</h1>
    <p class="subtitle">
      Model: ${latest.config.model || 'claude-sonnet-4-5-20250929'}
      &middot; ${new Date(latest.timestamp).toLocaleString()}
      &middot; ${latest.totalCount} questions evaluated
    </p>

    <div class="stats-row">
      <div class="stat-card">
        <div class="label">Overall Accuracy</div>
        <div class="value ${latest.metrics.medxpert_overall >= 0.5 ? 'pass' : 'fail'}">${overallAcc}%</div>
      </div>
      <div class="stat-card">
        <div class="label">Correct</div>
        <div class="value pass">${latest.correctCount} / ${latest.totalCount}</div>
      </div>
      <div class="stat-card">
        <div class="label">Errors</div>
        <div class="value ${latest.errorCount > 0 ? 'fail' : 'pass'}">${latest.errorCount}</div>
      </div>
      <div class="stat-card">
        <div class="label">10-Option MCQ</div>
        <div class="value neutral">A\u2013J</div>
      </div>
    </div>

    ${Array.from({ length: chartIndex }, (_, i) => `
    <div class="chart-card">
      <div class="chart-container">
        <canvas id="chart-${i}"></canvas>
      </div>
    </div>`).join('\n')}

    <div class="reference-card">
      <h2>Published Reference Results (MedXpertQA, ICML 2025)</h2>
      <div class="reference-row">
        <span class="model">GPT-4o</span>
        <span class="score">56.2%</span>
      </div>
      <div class="reference-row">
        <span class="model">Claude 3.5</span>
        <span class="score">53.8%</span>
      </div>
      <div class="reference-row">
        <span class="model">Med-Gemini</span>
        <span class="score">52.0%</span>
      </div>
      <div class="reference-row">
        <span class="model">This run (${latest.config.model || 'claude-sonnet-4-5-20250929'})</span>
        <span class="score highlight">${overallAcc}%</span>
      </div>
    </div>

    <div class="chart-card">
      <h2 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.75rem;">All Metrics</h2>
      <table class="metric-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Category</th>
            <th>Score</th>
            <th>Threshold</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(MEDXPERT_CATEGORIES).flatMap(([cat, keys]) =>
            keys.filter(k => latest.metrics[k] !== undefined).map(k => {
              const val = latest.metrics[k] ?? 0;
              const thresh = thresholds[k];
              const pass = thresh === undefined ? null : val >= thresh;
              const badge = pass === null ? '<span class="badge none">N/A</span>'
                : pass ? '<span class="badge pass">PASS</span>'
                : '<span class="badge fail">FAIL</span>';
              return `<tr>
                <td><strong>${MEDXPERT_METRIC_LABELS[k] || k}</strong></td>
                <td>${cat}</td>
                <td>${(val * 100).toFixed(1)}%</td>
                <td>${thresh !== undefined ? (thresh * 100).toFixed(0) + '%' : '\u2014'}</td>
                <td>${badge}</td>
              </tr>`;
            })
          ).join('\n          ')}
        </tbody>
      </table>
    </div>

    <div class="rerun-hint">
      <strong>Rerun MedXpertQA:</strong><br>
      <code>npm run test:medxpertqa</code> — full run (~2,460 questions)<br>
      <code>MEDXPERT_SAMPLES=10 npm run test:medxpertqa</code> — quick run with fewer questions<br>
      <code>npm run test:medxpertqa-visualize</code> — regenerate this chart<br>
      <code>npm run test:medxpertqa-visualize -- --compare</code> — compare last 5 runs
    </div>

    <footer>
      Generated ${new Date().toLocaleString()} &middot; MedXpertQA (Tsinghua C3I, ICML 2025)
    </footer>
  </div>

  <script>
    ${chartConfigs.join('\n')}
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isMedXpertQA = args.includes('--medxpertqa');
const isMedAgentBench = args.includes('--medagentbench');

if (isMedXpertQA) {
  const mxResults = loadMedXpertQAResults();
  const html = generateMedXpertQAHTML(mxResults);
  const outputPath = join(RESULTS_DIR, 'medxpertqa-chart.html');
  writeFileSync(outputPath, html);
  console.log(`MedXpertQA chart saved to ${outputPath}`);
  try {
    if (process.platform === 'darwin') execSync(`open "${outputPath}"`);
    else if (process.platform === 'linux') execSync(`xdg-open "${outputPath}"`);
    else if (process.platform === 'win32') execSync(`start "" "${outputPath}"`);
  } catch {
    console.log('Could not auto-open browser. Open the file manually.');
  }
} else if (isMedAgentBench) {
  const maResults = loadMedAgentBenchResults();
  const html = generateMedAgentBenchHTML(maResults);
  const outputPath = join(RESULTS_DIR, 'medagentbench-chart.html');
  writeFileSync(outputPath, html);
  console.log(`MedAgentBench chart saved to ${outputPath}`);
  try {
    if (process.platform === 'darwin') execSync(`open "${outputPath}"`);
    else if (process.platform === 'linux') execSync(`xdg-open "${outputPath}"`);
    else if (process.platform === 'win32') execSync(`start "" "${outputPath}"`);
  } catch {
    console.log('Could not auto-open browser. Open the file manually.');
  }
} else {
  const results = loadResults();
  const html = generateHTML(results);
  const outputPath = join(RESULTS_DIR, 'benchmark-chart.html');
  writeFileSync(outputPath, html);
  console.log(`Chart saved to ${outputPath}`);
  try {
    if (process.platform === 'darwin') execSync(`open "${outputPath}"`);
    else if (process.platform === 'linux') execSync(`xdg-open "${outputPath}"`);
    else if (process.platform === 'win32') execSync(`start "" "${outputPath}"`);
  } catch {
    console.log('Could not auto-open browser. Open the file manually.');
  }
}
