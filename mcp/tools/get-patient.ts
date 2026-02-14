import { createServiceClient } from '@second-opinion/shared';
import type { GetPatientParams, GetPatientResult } from '../types';

export const getPatientDefinition = {
  name: 'get_patient',
  description: 'Retrieve a patient profile by patient_id or user_id. Optionally include documents, sessions, and session stats.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      patient_id: { type: 'string', description: 'The patient UUID' },
      user_id: { type: 'string', description: 'The auth user UUID (alternative lookup)' },
      include_documents: { type: 'boolean', description: 'Include patient documents', default: false },
      include_sessions: { type: 'boolean', description: 'Include patient sessions', default: false },
      include_session_stats: { type: 'boolean', description: 'Include session count and last session date', default: false },
    },
  },
};

export async function getPatient(params: GetPatientParams): Promise<GetPatientResult> {
  const supabase = createServiceClient();

  // Look up patient
  let query = supabase.from('patients').select('*');
  if (params.patient_id) {
    query = query.eq('id', params.patient_id);
  } else if (params.user_id) {
    query = query.eq('user_id', params.user_id);
  } else {
    throw new Error('Either patient_id or user_id is required');
  }

  const { data: patient, error } = await query.single();
  if (error || !patient) throw new Error('Patient not found');

  const result: GetPatientResult = { patient };

  if (params.include_documents) {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('patient_id', patient.id)
      .order('uploaded_at', { ascending: false });
    result.documents = data || [];
  }

  if (params.include_sessions) {
    const { data } = await supabase
      .from('sessions')
      .select('id, status, mode, emergency_flagged, started_at, ended_at')
      .eq('patient_id', patient.id)
      .order('started_at', { ascending: false });
    result.sessions = data || [];
  }

  if (params.include_session_stats) {
    const { data } = await supabase
      .from('sessions')
      .select('started_at')
      .eq('patient_id', patient.id);
    const sessions = data || [];
    let lastSession: string | null = null;
    for (const s of sessions) {
      if (!lastSession || new Date(s.started_at) > new Date(lastSession)) {
        lastSession = s.started_at;
      }
    }
    result.session_stats = { session_count: sessions.length, last_session_at: lastSession };
  }

  return result;
}
