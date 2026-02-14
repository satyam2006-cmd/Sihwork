import { createServiceClient } from '@second-opinion/shared';
import type { WriteSessionSummaryParams } from '../types';

export const writeSessionSummaryDefinition = {
  name: 'write_session_summary',
  description: 'Write a human-readable session summary with key findings and follow-up items.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID' },
      patient_id: { type: 'string', description: 'The patient UUID' },
      summary_text: { type: 'string', description: 'Narrative summary of the consultation' },
      key_findings: { type: 'array', items: { type: 'string' }, description: 'Key clinical findings' },
      follow_up_items: { type: 'array', items: { type: 'string' }, description: 'Recommended follow-up actions' },
    },
    required: ['session_id', 'patient_id', 'summary_text', 'key_findings', 'follow_up_items'],
  },
};

export async function writeSessionSummary(params: WriteSessionSummaryParams): Promise<{ id: string }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('session_summaries')
    .insert({
      session_id: params.session_id,
      patient_id: params.patient_id,
      summary_text: params.summary_text,
      key_findings: params.key_findings,
      follow_up_items: params.follow_up_items,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to write session summary: ${error.message}`);
  return { id: data.id };
}
