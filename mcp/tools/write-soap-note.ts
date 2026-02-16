import { createServiceClient } from '@second-opinion/shared';
import type { WriteSOAPNoteParams } from '../types';

export const writeSOAPNoteDefinition = {
  name: 'write_soap_note',
  description: 'Write a SOAP note for a completed session. One per session.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID' },
      patient_id: { type: 'string', description: 'The patient UUID' },
      subjective: { type: 'string', description: 'Subjective findings (S)' },
      objective: { type: 'string', description: 'Objective findings (O)' },
      assessment: { type: 'string', description: 'Clinical assessment (A)' },
      plan: { type: 'string', description: 'Treatment plan (P)' },
    },
    required: ['session_id', 'patient_id', 'subjective', 'objective', 'assessment', 'plan'],
  },
};

export async function writeSOAPNote(params: WriteSOAPNoteParams): Promise<{ id: string }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('soap_notes')
    .insert({
      session_id: params.session_id,
      patient_id: params.patient_id,
      subjective: params.subjective,
      objective: params.objective,
      assessment: params.assessment,
      plan: params.plan,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to write SOAP note: ${error.message}`);
  return { id: data.id };
}
