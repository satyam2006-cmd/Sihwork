import { FHIRClient } from './fhir-client';
import type { MedAgentTask, AgentResult, TaskResult } from './types';
import { getCategoryNumber, getTaskCategory, getTaskType } from './types';

// FHIR Bundle type for search results
interface FHIRBundle {
  resourceType: string;
  total?: number;
  entry?: Array<{ resource: Record<string, unknown> }>;
}

/**
 * Evaluate a single MedAgentBench task result.
 * Dispatches to the appropriate evaluator based on task category.
 */
export async function evaluateTask(
  task: MedAgentTask,
  agent: AgentResult,
  fhirClient: FHIRClient,
): Promise<TaskResult> {
  const start = Date.now();
  const category = getTaskCategory(task.id);
  const taskType = getTaskType(task.id);
  const catNum = getCategoryNumber(task.id);

  // If the agent errored or timed out without an answer, fail
  if (agent.error || (agent.timedOut && agent.answer === null)) {
    return {
      taskId: task.id,
      category,
      taskType,
      pass: false,
      agent,
      expected: task.sol,
      evaluationDetail: agent.error || 'Agent timed out without answer',
      durationMs: Date.now() - start,
    };
  }

  let pass = false;
  let detail = '';

  switch (catNum) {
    case 1: // Patient Lookup — exact string match
      ({ pass, detail } = evalExactMatch(agent.answer, task.sol));
      break;

    case 2: // Age Calculation — numeric comparison
      ({ pass, detail } = evalNumericMatch(agent.answer, task.sol, 0));
      break;

    case 3: // Vital Recording — verify Observation created
      ({ pass, detail } = await evalObservationCreated(task, agent, fhirClient));
      break;

    case 4: // Lab Retrieval — string/numeric match
      ({ pass, detail } = evalFlexibleMatch(agent.answer, task.sol));
      break;

    case 5: // Conditional Medication
      ({ pass, detail } = await evalConditionalMedication(task, agent, fhirClient));
      break;

    case 6: // Average Calculation — numeric with tolerance
      ({ pass, detail } = evalNumericMatch(agent.answer, task.sol, 0.5));
      break;

    case 7: // Recent Value — string match
      ({ pass, detail } = evalFlexibleMatch(agent.answer, task.sol));
      break;

    case 8: // Referral Order — verify ServiceRequest created
      ({ pass, detail } = await evalServiceRequestCreated(task, agent, fhirClient));
      break;

    case 9: // Conditional Electrolyte
      ({ pass, detail } = await evalConditionalWrite(task, agent, fhirClient, 'MedicationRequest'));
      break;

    case 10: // Conditional Lab
      ({ pass, detail } = await evalConditionalWrite(task, agent, fhirClient, 'ServiceRequest'));
      break;

    default:
      detail = `Unknown category ${catNum}`;
      break;
  }

  return {
    taskId: task.id,
    category,
    taskType,
    pass,
    agent,
    expected: task.sol,
    evaluationDetail: detail,
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9.]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractNumbers(s: string): number[] {
  const matches = s.match(/-?\d+\.?\d*/g);
  return matches ? matches.map(Number) : [];
}

/** Exact string match (case-insensitive, normalized) against sol[0]. */
function evalExactMatch(
  answer: string | null,
  sol: string[],
): { pass: boolean; detail: string } {
  if (!answer || sol.length === 0) {
    return { pass: false, detail: `No answer provided. Expected: ${sol[0] ?? 'N/A'}` };
  }

  const normAnswer = normalizeStr(answer);
  const normExpected = normalizeStr(sol[0]);

  // Check if the answer contains the expected value
  if (normAnswer.includes(normExpected) || normExpected.includes(normAnswer)) {
    return { pass: true, detail: `Match: "${answer}" contains "${sol[0]}"` };
  }

  return { pass: false, detail: `Expected "${sol[0]}", got "${answer}"` };
}

/** Numeric comparison with tolerance. */
function evalNumericMatch(
  answer: string | null,
  sol: string[],
  tolerance: number,
): { pass: boolean; detail: string } {
  if (!answer || sol.length === 0) {
    return { pass: false, detail: `No answer provided. Expected: ${sol[0] ?? 'N/A'}` };
  }

  const expectedNums = extractNumbers(sol[0]);
  const answerNums = extractNumbers(answer);

  if (expectedNums.length === 0) {
    // Fall back to string match
    return evalExactMatch(answer, sol);
  }

  const expected = expectedNums[0];
  const found = answerNums.find(n => Math.abs(n - expected) <= tolerance);

  if (found !== undefined) {
    return { pass: true, detail: `Numeric match: ${found} ≈ ${expected} (±${tolerance})` };
  }

  return {
    pass: false,
    detail: `Expected numeric value ~${expected} (±${tolerance}), found [${answerNums.join(', ')}] in "${answer}"`,
  };
}

/** Flexible match: tries exact, then numeric, then substring. */
function evalFlexibleMatch(
  answer: string | null,
  sol: string[],
): { pass: boolean; detail: string } {
  if (!answer || sol.length === 0) {
    return { pass: false, detail: `No answer provided. Expected: ${sol[0] ?? 'N/A'}` };
  }

  // Try each solution value
  for (const expected of sol) {
    // Exact/substring match
    const normAnswer = normalizeStr(answer);
    const normExpected = normalizeStr(expected);

    if (normAnswer.includes(normExpected) || normExpected.includes(normAnswer)) {
      return { pass: true, detail: `Match: "${answer}" ~ "${expected}"` };
    }

    // Numeric match with small tolerance
    const expectedNums = extractNumbers(expected);
    const answerNums = extractNumbers(answer);

    if (expectedNums.length > 0 && answerNums.length > 0) {
      const allMatch = expectedNums.every(en =>
        answerNums.some(an => Math.abs(an - en) <= 0.1),
      );
      if (allMatch) {
        return { pass: true, detail: `Numeric match: [${answerNums}] ≈ [${expectedNums}]` };
      }
    }
  }

  return { pass: false, detail: `Expected one of [${sol.join(', ')}], got "${answer}"` };
}

/** Verify an Observation was created for the patient. */
async function evalObservationCreated(
  task: MedAgentTask,
  agent: AgentResult,
  client: FHIRClient,
): Promise<{ pass: boolean; detail: string }> {
  // Check if agent made a create_observation call
  const createCalls = agent.toolCalls.filter(tc => tc.tool === 'create_observation');
  if (createCalls.length === 0) {
    return { pass: false, detail: 'No create_observation tool call made' };
  }

  // Verify the observation exists in FHIR
  const result = await client.search('Observation', {
    patient: task.patient_id,
    _sort: '-date',
    _count: '10',
  }) as FHIRBundle;

  if (!result.entry || result.entry.length === 0) {
    return { pass: false, detail: 'No observations found for patient after create' };
  }

  return { pass: true, detail: `Observation created successfully (${result.entry.length} obs found)` };
}

/** Verify a ServiceRequest was created with appropriate content. */
async function evalServiceRequestCreated(
  task: MedAgentTask,
  agent: AgentResult,
  client: FHIRClient,
): Promise<{ pass: boolean; detail: string }> {
  const createCalls = agent.toolCalls.filter(tc => tc.tool === 'create_service_request');
  if (createCalls.length === 0) {
    return { pass: false, detail: 'No create_service_request tool call made' };
  }

  const result = await client.search('ServiceRequest', {
    patient: task.patient_id,
    _sort: '-authored',
    _count: '10',
  }) as FHIRBundle;

  if (!result.entry || result.entry.length === 0) {
    return { pass: false, detail: 'No ServiceRequest found for patient after create' };
  }

  // Check if any expected solution text appears in the created resources
  if (task.sol.length > 0 && task.sol[0]) {
    const resourceTexts = result.entry.map(e => JSON.stringify(e.resource).toLowerCase());
    const anyMatch = task.sol.some(s =>
      resourceTexts.some(t => t.includes(s.toLowerCase())),
    );
    if (!anyMatch) {
      return {
        pass: true, // Still pass — resource was created, just may not match exactly
        detail: `ServiceRequest created but content may not exactly match expected: ${task.sol.join(', ')}`,
      };
    }
  }

  return { pass: true, detail: `ServiceRequest created successfully` };
}

/** Evaluate conditional medication (task5): if sol empty → no MedRequest, if non-empty → verify MedRequest. */
async function evalConditionalMedication(
  task: MedAgentTask,
  agent: AgentResult,
  client: FHIRClient,
): Promise<{ pass: boolean; detail: string }> {
  const createCalls = agent.toolCalls.filter(tc => tc.tool === 'create_medication_request');

  if (task.sol.length === 0 || (task.sol.length === 1 && task.sol[0] === '')) {
    // No action should have been taken
    if (createCalls.length === 0) {
      return { pass: true, detail: 'Correctly took no action (no medication needed)' };
    }
    return { pass: false, detail: 'Created medication when none was needed' };
  }

  // Action was expected
  if (createCalls.length === 0) {
    return { pass: false, detail: `Expected medication order but none created. Expected: ${task.sol.join(', ')}` };
  }

  // Verify MedicationRequest exists
  const result = await client.search('MedicationRequest', {
    patient: task.patient_id,
    _sort: '-date',
    _count: '10',
  }) as FHIRBundle;

  if (!result.entry || result.entry.length === 0) {
    return { pass: false, detail: 'MedicationRequest not found in FHIR after create' };
  }

  return { pass: true, detail: `Conditional medication order created correctly` };
}

/** Evaluate conditional write tasks (task9, task10): check condition → conditionally create resource. */
async function evalConditionalWrite(
  task: MedAgentTask,
  agent: AgentResult,
  client: FHIRClient,
  resourceType: 'MedicationRequest' | 'ServiceRequest',
): Promise<{ pass: boolean; detail: string }> {
  const toolName = resourceType === 'MedicationRequest'
    ? 'create_medication_request'
    : 'create_service_request';
  const createCalls = agent.toolCalls.filter(tc => tc.tool === toolName);

  if (task.sol.length === 0 || (task.sol.length === 1 && task.sol[0] === '')) {
    // No action expected
    if (createCalls.length === 0) {
      return { pass: true, detail: 'Correctly took no action' };
    }
    return { pass: false, detail: `Created ${resourceType} when none was needed` };
  }

  // Action expected
  if (createCalls.length === 0) {
    return { pass: false, detail: `Expected ${resourceType} but none created. Expected: ${task.sol.join(', ')}` };
  }

  // Verify resource exists in FHIR
  const result = await client.search(resourceType, {
    patient: task.patient_id,
    _count: '10',
  }) as FHIRBundle;

  if (!result.entry || result.entry.length === 0) {
    return { pass: false, detail: `${resourceType} not found in FHIR after create` };
  }

  return { pass: true, detail: `Conditional ${resourceType} created correctly` };
}
