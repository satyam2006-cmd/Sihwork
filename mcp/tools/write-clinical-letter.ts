import { createServiceClient } from '@second-opinion/shared';
import type { WriteClinicalLetterParams } from '../types';

export const writeClinicalLetterDefinition = {
  name: 'write_clinical_letter',
  description: 'Write a clinical letter (referral, summary, follow-up, etc.) for a session. Multiple letters per session allowed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID' },
      patient_id: { type: 'string', description: 'The patient UUID' },
      letter_type: { type: 'string', enum: ['referral', 'clinical_summary', 'follow_up', 'disability', 'insurance', 'specialist', 'other'] },
      recipient_name: { type: 'string', description: 'Recipient name' },
      recipient_title: { type: 'string', description: 'Recipient title' },
      recipient_institution: { type: 'string', description: 'Recipient institution' },
      subject_line: { type: 'string', description: 'Letter subject line' },
      body: { type: 'string', description: 'Letter body text' },
      generated_by: { type: 'string', enum: ['ai', 'doctor'] },
    },
    required: ['session_id', 'patient_id', 'letter_type', 'subject_line', 'body'],
  },
};

export async function writeClinicalLetter(params: WriteClinicalLetterParams): Promise<{ id: string }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('clinical_letters')
    .insert({
      session_id: params.session_id,
      patient_id: params.patient_id,
      letter_type: params.letter_type,
      recipient_name: params.recipient_name || null,
      recipient_title: params.recipient_title || null,
      recipient_institution: params.recipient_institution || null,
      subject_line: params.subject_line,
      body: params.body,
      generated_by: params.generated_by || 'ai',
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to write clinical letter: ${error.message}`);
  return { id: data.id };
}
