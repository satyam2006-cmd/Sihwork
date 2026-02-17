import { createServiceClient } from '@second-opinion/shared';
import type { CreateSessionParams } from '../types';

export const createSessionDefinition = {
  name: 'create_session',
  description: 'Create a new consultation session for a patient.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      patient_id: { type: 'string', description: 'The patient UUID' },
      mode: { type: 'string', enum: ['text', 'voice', 'scribe'], description: 'Consultation mode' },
      doctor_id: { type: 'string', description: 'Doctor UUID (required for scribe mode)' },
      language: { type: 'string', description: 'Language code (default: en)', default: 'en' },
    },
    required: ['patient_id', 'mode'],
  },
};

export async function createSession(params: CreateSessionParams): Promise<{ session: Record<string, unknown> }> {
  const supabase = createServiceClient();

  const insertData: Record<string, unknown> = {
    patient_id: params.patient_id,
    mode: params.mode,
    language: params.language || 'en',
    status: 'active',
  };
  if (params.doctor_id) {
    insertData.doctor_id = params.doctor_id;
  }

  const { data: session, error } = await supabase
    .from('sessions')
    .insert(insertData)
    .select()
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return { session };
}
