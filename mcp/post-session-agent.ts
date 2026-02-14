import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from '@second-opinion/shared';
import type { ChatMessage } from '@second-opinion/shared';
import { compactTranscript } from '@second-opinion/shared';
import { writeVisitRecord } from './tools/write-visit-record';
import { writeSessionSummary } from './tools/write-session-summary';
import { updatePatient } from './tools/update-patient';
import type { WriteVisitRecordParams, WriteSessionSummaryParams, UpdatePatientParams } from './types';

const POST_SESSION_SYSTEM_PROMPT = `You are a medical documentation AI agent. You have just completed a consultation between a virtual doctor and a patient. Your task is to:

1. EXTRACT structured clinical data from the transcript
2. EVALUATE your own extraction confidence (0-1 scale)
3. WRITE the visit record using the write_visit_record tool
4. GENERATE a clinical summary using the write_session_summary tool
5. UPDATE the patient record if new conditions or medications were identified using the update_patient tool

TEMPORAL RULES:
- The user message may include PRE-EXISTING PATIENT HISTORY — this is background context only
- Extract findings ONLY from TODAY'S CONSULTATION TRANSCRIPT
- If a value appears in the patient history and is merely referenced in the conversation, it is NOT a new finding
- Clearly distinguish "history of [X]" from "currently presents with [Y]"

EXTRACTION GUIDELINES:
- Extract ONLY information explicitly discussed in the transcript
- Do NOT fabricate symptoms, diagnoses, or recommendations
- Use the patient's own language/descriptions where possible
- Rate your confidence honestly:
  - 0.8+ : Clear, complete conversation with unambiguous clinical data
  - 0.5-0.8 : Reasonable extraction but some ambiguity or gaps
  - <0.5 : Very short or unclear conversation, limited clinical value
- Set needs_review=true if confidence < 0.8

PATIENT UPDATE GUIDELINES:
- Only add conditions with "confirmed" or "probable" confidence
- Only add medications where action is "start"
- Use the update_patient tool to merge new values (deduplication is automatic)

You MUST call all three tools (write_visit_record, write_session_summary, update_patient if applicable) before finishing.`;

// Tool definitions for the post-session agent
const POST_SESSION_TOOLS: Anthropic.Tool[] = [
  {
    name: 'write_visit_record',
    description: 'Write a structured visit record extracted from the consultation transcript. Must be called exactly once.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chief_complaint: { type: 'string', description: 'Primary reason for the consultation' },
        symptoms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              severity: { type: 'string', enum: ['mild', 'moderate', 'severe'] },
              duration: { type: 'string' },
              frequency: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['name'],
          },
        },
        vitals: {
          type: 'object',
          properties: {
            blood_pressure: { type: 'string' },
            heart_rate: { type: 'string' },
            temperature: { type: 'string' },
          },
        },
        assessment: { type: 'string', description: 'Clinical assessment' },
        diagnoses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              condition: { type: 'string' },
              confidence: { type: 'string', enum: ['suspected', 'probable', 'confirmed'] },
            },
            required: ['condition'],
          },
        },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['test', 'medication', 'lifestyle', 'referral', 'follow_up', 'other'] },
              description: { type: 'string' },
              urgency: { type: 'string', enum: ['routine', 'soon', 'urgent'] },
            },
            required: ['type', 'description'],
          },
        },
        follow_up: { type: 'string', description: 'Follow-up plan' },
        red_flags: { type: 'array', items: { type: 'string' } },
        medication_changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              medication: { type: 'string' },
              action: { type: 'string', enum: ['start', 'stop', 'modify', 'continue'] },
              details: { type: 'string' },
            },
            required: ['medication', 'action'],
          },
        },
        confidence_score: { type: 'number', description: 'Self-assessed extraction confidence (0-1)' },
        needs_review: { type: 'boolean', description: 'Whether a doctor should review this record' },
      },
      required: ['chief_complaint', 'assessment', 'confidence_score', 'needs_review'],
    },
  },
  {
    name: 'write_session_summary',
    description: 'Write a human-readable summary of the consultation. Must be called exactly once.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary_text: { type: 'string', description: '2-3 paragraph narrative summary' },
        key_findings: { type: 'array', items: { type: 'string' }, description: 'Key clinical findings' },
        follow_up_items: { type: 'array', items: { type: 'string' }, description: 'Recommended follow-up actions' },
      },
      required: ['summary_text', 'key_findings', 'follow_up_items'],
    },
  },
  {
    name: 'update_patient',
    description: 'Update the patient record with new conditions or medications discovered during the consultation. Only call if new confirmed/probable conditions or new medications were identified.',
    input_schema: {
      type: 'object' as const,
      properties: {
        new_conditions: { type: 'array', items: { type: 'string' }, description: 'New chronic conditions (confirmed/probable only)' },
        new_medications: { type: 'array', items: { type: 'string' }, description: 'New medications (start action only)' },
        new_allergies: { type: 'array', items: { type: 'string' }, description: 'Newly discovered allergies' },
      },
    },
  },
];

export interface PostSessionResult {
  visit_record_id?: string;
  summary_id?: string;
  patient_updated: boolean;
  errors: string[];
}

export async function runPostSessionAgent(
  sessionId: string,
  patientId: string,
  transcript: ChatMessage[],
  ehrContext?: string,
): Promise<PostSessionResult> {
  const client = getAnthropicClient();
  const result: PostSessionResult = {
    patient_updated: false,
    errors: [],
  };

  const rawTranscript = transcript
    .map(m => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.content}`)
    .join('\n');

  // Compact long transcripts to stay within token limits (full transcript stays in DB for audit)
  const transcriptText = await compactTranscript(rawTranscript, 50_000);

  const ehrSection = ehrContext
    ? `\n\n=== PRE-EXISTING PATIENT HISTORY (before today — reference only, do NOT extract as new) ===\n${ehrContext}\n`
    : '';

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Process the following consultation transcript. Extract clinical data, write a visit record, generate a summary, and update the patient record if applicable.\n\nSession ID: ${sessionId}\nPatient ID: ${patientId}${ehrSection}\n\n=== TODAY'S CONSULTATION TRANSCRIPT (extract from THIS only) ===\n${transcriptText}`,
    },
  ];

  // Agentic tool_use loop
  let maxIterations = 10; // Safety limit
  while (maxIterations-- > 0) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: POST_SESSION_SYSTEM_PROMPT,
      messages,
      tools: POST_SESSION_TOOLS,
    });

    if (response.stop_reason !== 'tool_use') {
      break; // Agent is done
    }

    // Process tool calls
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        try {
          const toolResult = await executePostSessionTool(
            block.name,
            block.input as Record<string, unknown>,
            sessionId,
            patientId,
            result,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult),
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push(`${block.name}: ${errorMsg}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: errorMsg }),
            is_error: true,
          });
        }
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return result;
}

async function executePostSessionTool(
  name: string,
  input: Record<string, unknown>,
  sessionId: string,
  patientId: string,
  result: PostSessionResult,
): Promise<unknown> {
  switch (name) {
    case 'write_visit_record': {
      const params: WriteVisitRecordParams = {
        session_id: sessionId,
        patient_id: patientId,
        chief_complaint: input.chief_complaint as string,
        symptoms: (input.symptoms as unknown[]) || [],
        vitals: (input.vitals as Record<string, unknown>) || null,
        assessment: input.assessment as string,
        diagnoses: (input.diagnoses as unknown[]) || [],
        recommendations: (input.recommendations as unknown[]) || [],
        follow_up: (input.follow_up as string) || null,
        red_flags: (input.red_flags as string[]) || [],
        medication_changes: (input.medication_changes as unknown[]) || [],
        confidence_score: input.confidence_score as number,
        needs_review: input.needs_review as boolean,
      };
      const { id } = await writeVisitRecord(params);
      result.visit_record_id = id;
      return { success: true, id };
    }

    case 'write_session_summary': {
      const params: WriteSessionSummaryParams = {
        session_id: sessionId,
        patient_id: patientId,
        summary_text: input.summary_text as string,
        key_findings: (input.key_findings as string[]) || [],
        follow_up_items: (input.follow_up_items as string[]) || [],
      };
      const { id } = await writeSessionSummary(params);
      result.summary_id = id;
      return { success: true, id };
    }

    case 'update_patient': {
      const hasUpdates =
        (input.new_conditions as string[] | undefined)?.length ||
        (input.new_medications as string[] | undefined)?.length ||
        (input.new_allergies as string[] | undefined)?.length;

      if (!hasUpdates) {
        return { success: true, message: 'No updates needed' };
      }

      const params: UpdatePatientParams = {
        patient_id: patientId,
        new_conditions: (input.new_conditions as string[]) || undefined,
        new_medications: (input.new_medications as string[]) || undefined,
        new_allergies: (input.new_allergies as string[]) || undefined,
      };
      await updatePatient(params);
      result.patient_updated = true;
      return { success: true };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
