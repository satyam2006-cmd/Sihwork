/**
 * Extraction Accuracy Test
 *
 * Evaluates post-session extraction quality against reference SOAP notes.
 * This test requires ANTHROPIC_API_KEY for Claude calls.
 */
import 'dotenv/config';
import { getAnthropicClient } from '@second-opinion/shared';
import { loadSOAPSamples } from './utils/dataset-loader';
import { rougeScore, fieldCoverage, printResultsTable } from './utils/metrics';

interface TestResult {
  name: string;
  pass: boolean;
  metric: string;
  value: number;
  threshold: number;
  details?: string;
}

const EXTRACTION_PROMPT = `You are a medical documentation AI. Given a doctor-patient dialogue, extract:
1. chief_complaint: The main reason for the visit
2. symptoms: Array of symptoms mentioned
3. assessment: Your clinical assessment
4. recommendations: Array of recommended actions
5. key_findings: Array of key clinical findings

Return ONLY valid JSON with these fields. Do not include any other text.`;

async function extractFromDialogue(dialogue: string): Promise<Record<string, unknown>> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: EXTRACTION_PROMPT,
    messages: [
      { role: 'user', content: `Extract clinical data from this dialogue:\n\n${dialogue}` },
    ],
  });

  const text = response.content.find(c => c.type === 'text');
  if (!text || text.type !== 'text') return {};

  let jsonStr = text.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

async function main() {
  const sampleCount = parseInt(process.env.EVAL_SAMPLE_COUNT || '10', 10);

  console.log(`Loading ${sampleCount} SOAP samples...`);
  let samples;
  try {
    samples = await loadSOAPSamples(sampleCount);
  } catch (err) {
    console.log('Could not load SOAP samples from HuggingFace (may need network access).');
    console.log('Running with synthetic samples instead.\n');
    samples = generateSyntheticSOAPSamples(sampleCount);
  }

  console.log(`Processing ${samples.length} samples...\n`);

  const expectedFields = ['chief_complaint', 'symptoms', 'assessment', 'recommendations', 'key_findings'];
  const coverageScores: number[] = [];
  const rougeScores: number[] = [];
  let processedCount = 0;

  for (const sample of samples.slice(0, sampleCount)) {
    if (!sample.dialogue || sample.dialogue.length < 50) continue;

    try {
      const extraction = await extractFromDialogue(sample.dialogue);
      const { coverage, missing } = fieldCoverage(extraction, expectedFields);
      coverageScores.push(coverage);

      // Compare assessment against reference SOAP note
      const extractedAssessment = String(extraction.assessment || '');
      const rouge = rougeScore(sample.soap_note, extractedAssessment);
      rougeScores.push(rouge);

      processedCount++;
      process.stdout.write(`  Processed ${processedCount}/${sampleCount}  coverage: ${(coverage * 100).toFixed(0)}%  rouge: ${rouge.toFixed(2)}\r`);
    } catch (err) {
      console.error(`  Skipped sample: ${err}`);
    }
  }

  console.log('\n');

  const avgCoverage = coverageScores.length > 0
    ? coverageScores.reduce((a, b) => a + b, 0) / coverageScores.length
    : 0;
  const avgRouge = rougeScores.length > 0
    ? rougeScores.reduce((a, b) => a + b, 0) / rougeScores.length
    : 0;

  const results: TestResult[] = [
    {
      name: `Field coverage (${processedCount} samples)`,
      pass: avgCoverage >= 0.8,
      metric: 'avg_coverage',
      value: avgCoverage,
      threshold: 0.8,
      details: `Min: ${Math.min(...coverageScores).toFixed(2)}, Max: ${Math.max(...coverageScores).toFixed(2)}`,
    },
    {
      name: `ROUGE score on assessment (${processedCount} samples)`,
      pass: avgRouge >= 0.15, // ROUGE-1 recall against full SOAP note (intentionally lenient)
      metric: 'avg_rouge',
      value: avgRouge,
      threshold: 0.15,
      details: `Comparing extracted assessment vs full reference SOAP note`,
    },
    {
      name: 'Samples processed successfully',
      pass: processedCount >= Math.floor(sampleCount * 0.8),
      metric: 'processed',
      value: processedCount,
      threshold: Math.floor(sampleCount * 0.8),
    },
  ];

  printResultsTable(results);

  const allPassed = results.every(r => r.pass);
  process.exit(allPassed ? 0 : 1);
}

/**
 * Fallback synthetic SOAP samples when HuggingFace is unavailable.
 */
function generateSyntheticSOAPSamples(count: number) {
  const samples = [];
  const dialogues = [
    {
      dialogue: `Patient: I've been having severe headaches for the past week.
Doctor: Can you describe the headaches? Where is the pain located?
Patient: It's mostly on the right side, behind my eye. It throbs.
Doctor: How long do the episodes last?
Patient: Usually 4-6 hours. Light makes it worse.
Doctor: Any nausea or visual changes before the headache?
Patient: Yes, I sometimes see zigzag lines before it starts.
Doctor: Based on your symptoms, this sounds like migraine with aura.`,
      soap_note: 'Subjective: Patient reports severe right-sided headaches for one week, throbbing quality behind right eye, lasting 4-6 hours, photosensitivity, visual aura (zigzag lines). Objective: No focal neurological deficits. Assessment: Migraine with aura. Plan: Start sumatriptan for acute episodes, headache diary, follow up in 4 weeks.',
    },
    {
      dialogue: `Patient: I've had a cough for about three weeks now.
Doctor: Is it a dry cough or are you producing mucus?
Patient: Mostly dry, but sometimes there's a little clear mucus.
Doctor: Any fever or shortness of breath?
Patient: No fever. I do get a bit winded walking up stairs.
Doctor: Are you a smoker?
Patient: I quit 5 years ago, but I smoked for 20 years.
Doctor: Any weight loss or night sweats?
Patient: No, nothing like that.`,
      soap_note: 'Subjective: 3-week persistent cough, mostly dry with occasional clear mucus, mild dyspnea on exertion, former smoker (20 pack-year history, quit 5 years ago). No fever, weight loss, or night sweats. Assessment: Chronic cough, likely post-infectious or related to airway remodeling from prior smoking. Plan: Chest X-ray, pulmonary function tests, reassess in 2 weeks.',
    },
  ];

  for (let i = 0; i < count; i++) {
    samples.push(dialogues[i % dialogues.length]);
  }
  return samples;
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
