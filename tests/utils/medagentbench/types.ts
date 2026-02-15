import type Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// MedAgentBench task schema (from test_data_v2.json)
// ---------------------------------------------------------------------------

export interface MedAgentTask {
  id: string;            // e.g. "task5_3"
  patient_id: string;    // FHIR Patient ID
  instruction: string;   // The clinical task description
  context?: string;      // Additional context (optional)
  sol: string[];         // Expected solution values (empty = "no action needed")
}

// ---------------------------------------------------------------------------
// Task categories (derived from task ID prefix)
// ---------------------------------------------------------------------------

export type TaskCategory =
  | 'patient_lookup'
  | 'age_calculation'
  | 'vital_recording'
  | 'lab_retrieval'
  | 'conditional_medication'
  | 'average_calculation'
  | 'recent_value'
  | 'referral_order'
  | 'conditional_electrolyte'
  | 'conditional_lab';

export type TaskType = 'retrieval' | 'write' | 'conditional';

export const CATEGORY_MAP: Record<number, { category: TaskCategory; type: TaskType }> = {
  1:  { category: 'patient_lookup',          type: 'retrieval' },
  2:  { category: 'age_calculation',         type: 'retrieval' },
  3:  { category: 'vital_recording',         type: 'write' },
  4:  { category: 'lab_retrieval',           type: 'retrieval' },
  5:  { category: 'conditional_medication',  type: 'conditional' },
  6:  { category: 'average_calculation',     type: 'retrieval' },
  7:  { category: 'recent_value',            type: 'retrieval' },
  8:  { category: 'referral_order',          type: 'write' },
  9:  { category: 'conditional_electrolyte', type: 'conditional' },
  10: { category: 'conditional_lab',         type: 'conditional' },
};

/** Extract the numeric category prefix from a task ID like "task5_3" → 5 */
export function getCategoryNumber(taskId: string): number {
  const match = taskId.match(/^task(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function getTaskCategory(taskId: string): TaskCategory {
  const num = getCategoryNumber(taskId);
  return CATEGORY_MAP[num]?.category ?? 'patient_lookup';
}

export function getTaskType(taskId: string): TaskType {
  const num = getCategoryNumber(taskId);
  return CATEGORY_MAP[num]?.type ?? 'retrieval';
}

// ---------------------------------------------------------------------------
// Agent loop types
// ---------------------------------------------------------------------------

export interface AgentResult {
  answer: string | null;         // Final answer from finish_task
  rounds: number;                // Number of tool_use rounds
  toolCalls: ToolCallRecord[];   // Record of all tool calls made
  timedOut: boolean;
  error?: string;
}

export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
}

// ---------------------------------------------------------------------------
// Task evaluation result
// ---------------------------------------------------------------------------

export interface TaskResult {
  taskId: string;
  category: TaskCategory;
  taskType: TaskType;
  pass: boolean;
  agent: AgentResult;
  expected: string[];
  evaluationDetail: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Aggregate metrics
// ---------------------------------------------------------------------------

export interface MedAgentMetrics {
  medagent_overall_pass_rate: number;
  medagent_retrieval_pass_rate: number;
  medagent_write_pass_rate: number;
  medagent_conditional_pass_rate: number;
  medagent_patient_lookup: number;
  medagent_age_calculation: number;
  medagent_vital_recording: number;
  medagent_lab_retrieval: number;
  medagent_conditional_medication: number;
  medagent_average_calculation: number;
  medagent_recent_value: number;
  medagent_referral_order: number;
  medagent_conditional_electrolyte: number;
  medagent_conditional_lab: number;
}

// ---------------------------------------------------------------------------
// FHIR tool handler type
// ---------------------------------------------------------------------------

export type FHIRToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export interface FHIRToolDefinition {
  tool: Anthropic.Tool;
  handler: FHIRToolHandler;
}
