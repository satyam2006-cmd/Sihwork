import { createServiceClient } from '@second-opinion/shared';
import type { UpdateClinicalLetterParams } from '../types';

export const updateClinicalLetterDefinition = {
  name: 'update_clinical_letter',
  description: 'Update a clinical letter (doctor edits or finalization).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      letter_id: { type: 'string', description: 'The clinical letter UUID' },
      letter_type: { type: 'string', enum: ['referral', 'clinical_summary', 'follow_up', 'disability', 'insurance', 'specialist', 'other'] },
      recipient_name: { type: 'string' },
      recipient_title: { type: 'string' },
      recipient_institution: { type: 'string' },
      subject_line: { type: 'string' },
      body: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'edited', 'finalized'] },
    },
    required: ['letter_id'],
  },
};

export async function updateClinicalLetter(params: UpdateClinicalLetterParams): Promise<{ success: boolean }> {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = {};
  if (params.letter_type !== undefined) update.letter_type = params.letter_type;
  if (params.recipient_name !== undefined) update.recipient_name = params.recipient_name;
  if (params.recipient_title !== undefined) update.recipient_title = params.recipient_title;
  if (params.recipient_institution !== undefined) update.recipient_institution = params.recipient_institution;
  if (params.subject_line !== undefined) update.subject_line = params.subject_line;
  if (params.body !== undefined) update.body = params.body;
  if (params.status !== undefined) {
    update.status = params.status;
    if (params.status === 'finalized') {
      update.finalized_at = new Date().toISOString();
    }
  }
  update.edited_at = new Date().toISOString();

  const { error } = await supabase
    .from('clinical_letters')
    .update(update)
    .eq('id', params.letter_id);

  if (error) throw new Error(`Failed to update clinical letter: ${error.message}`);
  return { success: true };
}
