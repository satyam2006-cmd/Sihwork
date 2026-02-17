import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, MODELS } from '@second-opinion/shared';
import type { ChatMessage } from '@second-opinion/shared';
import { compactTranscript } from '@second-opinion/shared';
import { writeVisitRecord } from './tools/write-visit-record';
import { writeSessionSummary } from './tools/write-session-summary';
import { writeSOAPNote } from './tools/write-soap-note';
import { writeEHREntry } from './tools/write-ehr-entry';
import { writeClinicalLetter } from './tools/write-clinical-letter';
import { updatePatient } from './tools/update-patient';
import type {
  WriteVisitRecordParams, WriteSessionSummaryParams, UpdatePatientParams,
  WriteSOAPNoteParams, WriteEHREntryParams, WriteClinicalLetterParams,
} from './types';

function buildPostSessionSystemPrompt(sessionMode?: 'text' | 'voice' | 'scribe'): string {
  const isScribe = sessionMode === 'scribe';

  const contextLine = isScribe
    ? 'You are a medical documentation AI agent. You have the transcript of an in-person clinic visit between a doctor and a patient. The transcript was captured via a real-time scribe — speakers are NOT labeled, so you must infer who is speaking from context (clinical questions = doctor, symptom descriptions = patient).'
    : 'You are a medical documentation AI agent. You have just completed a consultation between a virtual doctor and a patient.';

  const soapObjective = isScribe
    ? '- O (Objective): Observable findings discussed during the visit. Extract physical exam findings as discussed in the conversation. 2-6 sentences.'
    : '- O (Objective): Observable findings. Note "Virtual encounter — limited physical examination". 2-6 sentences.';

  const ehrPhysicalExam = isScribe
    ? '- Extract physical exam findings as discussed during the in-person visit'
    : '- Note virtual encounter limitations in physical exam';

  const encounterTypeGuidance = isScribe
    ? '- Use encounter_type "in_person_visit" for this in-person clinic visit'
    : '- Use appropriate encounter_type (virtual_consultation, follow_up, urgent, emergency)';

  return `${contextLine} Your task is to:

1. EXTRACT structured clinical data from the transcript
2. EVALUATE your own extraction confidence (0-1 scale)
3. WRITE the visit record using the write_visit_record tool
4. GENERATE a clinical summary using the write_session_summary tool
5. WRITE a SOAP note using the write_soap_note tool
6. WRITE a formal EHR encounter entry using the write_ehr_entry tool
7. UPDATE the patient record if new conditions or medications were identified using the update_patient tool
8. IF a referral was recommended during the consultation, generate a referral letter using the write_clinical_letter tool

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

SOAP NOTE GUIDELINES:
- S (Subjective): Patient-reported symptoms, concerns, history. 2-6 sentences.
${soapObjective}
- A (Assessment): Clinical impression, differentials, risk stratification. 2-6 sentences.
- P (Plan): Diagnostics, therapeutics, referrals, follow-up, education, red flags. 2-6 sentences.

EHR ENTRY GUIDELINES:
- Use OLDCARTS format for HPI where applicable
- Include ICD codes only when clearly identifiable
${ehrPhysicalExam}
${encounterTypeGuidance}
- Organize assessment and plan by problem/diagnosis

CLINICAL LETTER GUIDELINES:
- Only generate a referral letter if a referral was explicitly recommended
- Use professional medical letter format
- Include relevant clinical context for the specialist

REQUIRED TOOLS: write_visit_record, write_session_summary, write_soap_note, write_ehr_entry
CONDITIONAL TOOLS: write_clinical_letter (only if referral recommended), update_patient (only if new conditions/medications)

You MUST call all required tools before finishing.`;
}

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
    name: 'write_soap_note',
    description: 'Write a SOAP note for the consultation. Must be called exactly once.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subjective: { type: 'string', description: 'Subjective findings — patient-reported symptoms, concerns, history (2-6 sentences)' },
        objective: { type: 'string', description: 'Objective findings — observable data, vitals, virtual encounter limitations (2-6 sentences)' },
        assessment: { type: 'string', description: 'Clinical assessment — impression, differentials, risk stratification (2-6 sentences)' },
        plan: { type: 'string', description: 'Treatment plan — diagnostics, therapeutics, referrals, follow-up, education (2-6 sentences)' },
      },
      required: ['subjective', 'objective', 'assessment', 'plan'],
    },
  },
  {
    name: 'write_ehr_entry',
    description: 'Write a formal EHR encounter entry for the consultation. Must be called exactly once.',
    input_schema: {
      type: 'object' as const,
      properties: {
        encounter_type: { type: 'string', enum: ['virtual_consultation', 'follow_up', 'urgent', 'emergency', 'in_person_visit'], description: 'Type of encounter' },
        chief_complaint: { type: 'string', description: 'Primary reason for visit' },
        history_of_present_illness: { type: 'string', description: 'HPI using OLDCARTS format where applicable' },
        past_medical_history: { type: 'string', description: 'Relevant PMH discussed' },
        review_of_systems: { type: 'object', description: 'ROS by system name {system: findings}' },
        physical_exam: { type: 'string', description: 'Physical exam or virtual encounter limitations' },
        assessment_and_plan: { type: 'string', description: 'Assessment and plan organized by problem/diagnosis' },
        diagnoses_icd: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'ICD code (omit if uncertain)' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['primary', 'secondary', 'rule_out'] },
            },
            required: ['description'],
          },
        },
        procedures_cpt: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'CPT code (omit if uncertain)' },
              description: { type: 'string' },
            },
            required: ['description'],
          },
        },
        orders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['lab', 'imaging', 'referral', 'procedure', 'other'] },
              description: { type: 'string' },
              urgency: { type: 'string', enum: ['routine', 'urgent', 'stat'] },
            },
            required: ['type', 'description'],
          },
        },
        prescriptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              medication: { type: 'string' },
              dosage: { type: 'string' },
              frequency: { type: 'string' },
              duration: { type: 'string' },
            },
            required: ['medication'],
          },
        },
        follow_up_instructions: { type: 'string', description: 'Follow-up timeline and red flags' },
      },
      required: ['chief_complaint', 'history_of_present_illness', 'assessment_and_plan'],
    },
  },
  {
    name: 'write_clinical_letter',
    description: 'Write a clinical letter (e.g., referral letter). Only call if a referral or letter is warranted based on the consultation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        letter_type: { type: 'string', enum: ['referral', 'clinical_summary', 'follow_up', 'disability', 'insurance', 'specialist', 'other'] },
        recipient_name: { type: 'string', description: 'Recipient name (if known)' },
        recipient_title: { type: 'string', description: 'Recipient title (if known)' },
        recipient_institution: { type: 'string', description: 'Recipient institution (if known)' },
        subject_line: { type: 'string', description: 'Letter subject line' },
        body: { type: 'string', description: 'Full letter body in professional medical format' },
      },
      required: ['letter_type', 'subject_line', 'body'],
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
  soap_note_id?: string;
  ehr_entry_id?: string;
  clinical_letter_ids: string[];
  patient_updated: boolean;
  errors: string[];
}

export async function runPostSessionAgent(
  sessionId: string,
  patientId: string,
  transcript: ChatMessage[],
  ehrContext?: string,
  sessionMode?: 'text' | 'voice' | 'scribe',
): Promise<PostSessionResult> {
  const client = getAnthropicClient();
  const result: PostSessionResult = {
    clinical_letter_ids: [],
    patient_updated: false,
    errors: [],
  };

  // Scribe transcripts are raw ASR chunks — don't label speakers, let LLM infer
  const rawTranscript = sessionMode === 'scribe'
    ? transcript.map(m => m.content).join('\n\n')
    : transcript.map(m => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.content}`).join('\n');

  // Compact long transcripts to stay within token limits (full transcript stays in DB for audit)
  const transcriptText = await compactTranscript(rawTranscript, 50_000);

  const ehrSection = ehrContext
    ? `\n\n=== PRE-EXISTING PATIENT HISTORY (before today — reference only, do NOT extract as new) ===\n${ehrContext}\n`
    : '';

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Process the following consultation transcript. Extract clinical data, write a visit record, generate a summary, write a SOAP note, write an EHR entry, and if a referral was recommended, generate a referral letter. Update the patient record if applicable.\n\nSession ID: ${sessionId}\nPatient ID: ${patientId}${ehrSection}\n\n=== TODAY'S CONSULTATION TRANSCRIPT (extract from THIS only) ===\n${transcriptText}`,
    },
  ];

  // Agentic tool_use loop
  let maxIterations = 15; // Increased for generating 6+ documents
  while (maxIterations-- > 0) {
    const response = await client.messages.create({
      model: MODELS.advanced,
      max_tokens: 8192,
      system: buildPostSessionSystemPrompt(sessionMode),
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

    case 'write_soap_note': {
      const params: WriteSOAPNoteParams = {
        session_id: sessionId,
        patient_id: patientId,
        subjective: input.subjective as string,
        objective: input.objective as string,
        assessment: input.assessment as string,
        plan: input.plan as string,
      };
      const { id } = await writeSOAPNote(params);
      result.soap_note_id = id;
      return { success: true, id };
    }

    case 'write_ehr_entry': {
      const params: WriteEHREntryParams = {
        session_id: sessionId,
        patient_id: patientId,
        encounter_date: (input.encounter_date as string) || undefined,
        encounter_type: (input.encounter_type as string) || 'virtual_consultation',
        chief_complaint: input.chief_complaint as string,
        history_of_present_illness: input.history_of_present_illness as string,
        past_medical_history: (input.past_medical_history as string) || undefined,
        review_of_systems: (input.review_of_systems as Record<string, string>) || undefined,
        physical_exam: (input.physical_exam as string) || undefined,
        assessment_and_plan: input.assessment_and_plan as string,
        diagnoses_icd: (input.diagnoses_icd as unknown[]) || undefined,
        procedures_cpt: (input.procedures_cpt as unknown[]) || undefined,
        orders: (input.orders as unknown[]) || undefined,
        prescriptions: (input.prescriptions as unknown[]) || undefined,
        follow_up_instructions: (input.follow_up_instructions as string) || undefined,
      };
      const { id } = await writeEHREntry(params);
      result.ehr_entry_id = id;
      return { success: true, id };
    }

    case 'write_clinical_letter': {
      const params: WriteClinicalLetterParams = {
        session_id: sessionId,
        patient_id: patientId,
        letter_type: input.letter_type as string,
        recipient_name: (input.recipient_name as string) || undefined,
        recipient_title: (input.recipient_title as string) || undefined,
        recipient_institution: (input.recipient_institution as string) || undefined,
        subject_line: input.subject_line as string,
        body: input.body as string,
        generated_by: 'ai',
      };
      const { id } = await writeClinicalLetter(params);
      result.clinical_letter_ids.push(id);
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
