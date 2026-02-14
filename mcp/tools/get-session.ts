import { createServiceClient } from '@second-opinion/shared';
import type { GetSessionParams, GetSessionResult } from '../types';

export const getSessionDefinition = {
  name: 'get_session',
  description: 'Get a session by ID. Optionally include visit record, summary, and patient name. Can verify ownership via verify_owner_user_id.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID' },
      include_visit_record: { type: 'boolean', default: false },
      include_summary: { type: 'boolean', default: false },
      include_patient_name: { type: 'boolean', default: false },
      verify_owner_user_id: { type: 'string', description: 'If set, verifies the session belongs to this user' },
    },
    required: ['session_id'],
  },
};

export async function getSession(params: GetSessionParams): Promise<GetSessionResult> {
  const supabase = createServiceClient();

  // Fetch session
  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', params.session_id)
    .single();

  if (error || !session) throw new Error('Session not found');

  // Ownership check — fetch patient to verify
  if (params.verify_owner_user_id) {
    const { data: patient } = await supabase
      .from('patients')
      .select('user_id')
      .eq('id', session.patient_id)
      .single();

    if (!patient || patient.user_id !== params.verify_owner_user_id) {
      throw new Error('Session not found');
    }
  }

  const result: GetSessionResult = { session };

  // Patient name
  if (params.include_patient_name) {
    const { data: patient } = await supabase
      .from('patients')
      .select('full_name')
      .eq('id', session.patient_id)
      .single();
    result.patient_name = patient?.full_name || 'Unknown';
  }

  if (params.include_visit_record) {
    const { data } = await supabase
      .from('visit_records')
      .select('*')
      .eq('session_id', params.session_id)
      .single();
    result.visit_record = data || null;
  }

  if (params.include_summary) {
    const { data } = await supabase
      .from('session_summaries')
      .select('*')
      .eq('session_id', params.session_id)
      .single();
    result.summary = data || null;
  }

  return result;
}
