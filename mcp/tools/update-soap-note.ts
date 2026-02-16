import { createServiceClient } from '@second-opinion/shared';
import type { UpdateSOAPNoteParams } from '../types';

export const updateSOAPNoteDefinition = {
  name: 'update_soap_note',
  description: 'Update a SOAP note (doctor edits or finalization).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      soap_note_id: { type: 'string', description: 'The SOAP note UUID' },
      subjective: { type: 'string' },
      objective: { type: 'string' },
      assessment: { type: 'string' },
      plan: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'edited', 'finalized'] },
    },
    required: ['soap_note_id'],
  },
};

export async function updateSOAPNote(params: UpdateSOAPNoteParams): Promise<{ success: boolean }> {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = {};
  if (params.subjective !== undefined) update.subjective = params.subjective;
  if (params.objective !== undefined) update.objective = params.objective;
  if (params.assessment !== undefined) update.assessment = params.assessment;
  if (params.plan !== undefined) update.plan = params.plan;
  if (params.status !== undefined) {
    update.status = params.status;
    if (params.status === 'finalized') {
      update.finalized_at = new Date().toISOString();
    }
  }
  update.edited_at = new Date().toISOString();

  const { error } = await supabase
    .from('soap_notes')
    .update(update)
    .eq('id', params.soap_note_id);

  if (error) throw new Error(`Failed to update SOAP note: ${error.message}`);
  return { success: true };
}
