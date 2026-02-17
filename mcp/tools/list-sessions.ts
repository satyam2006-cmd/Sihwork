import { createServiceClient } from '@second-opinion/shared';
import type { ListSessionsParams } from '../types';

export const listSessionsDefinition = {
  name: 'list_sessions',
  description: 'List sessions, optionally filtered by patient_id. Can include patient names and review status for doctor views.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      patient_id: { type: 'string', description: 'Filter by patient UUID' },
      include_patient_names: { type: 'boolean', default: false },
      include_review_status: { type: 'boolean', default: false },
      mode_filter: { type: 'string', description: 'Filter by session mode (text, voice, scribe)' },
    },
  },
};

export async function listSessions(params: ListSessionsParams): Promise<{ sessions: Record<string, unknown>[] }> {
  const supabase = createServiceClient();

  let query = supabase
    .from('sessions')
    .select('id, patient_id, doctor_id, status, mode, language, emergency_flagged, started_at, ended_at')
    .order('started_at', { ascending: false });

  if (params.patient_id) {
    query = query.eq('patient_id', params.patient_id);
  }

  if (params.mode_filter) {
    query = query.eq('mode', params.mode_filter);
  }

  const { data: sessions, error } = await query;
  if (error) throw new Error(`Failed to list sessions: ${error.message}`);

  const sessionList = sessions || [];

  // Enrich with patient names
  let patientMap: Map<string, string> | undefined;
  if (params.include_patient_names && sessionList.length > 0) {
    const patientIds = [...new Set(sessionList.map(s => s.patient_id))];
    const { data: patients } = await supabase
      .from('patients')
      .select('id, full_name')
      .in('id', patientIds);

    patientMap = new Map((patients || []).map(p => [p.id, p.full_name]));
  }

  // Enrich with review status
  let reviewMap: Map<string, boolean> | undefined;
  if (params.include_review_status && sessionList.length > 0) {
    const sessionIds = sessionList.map(s => s.id);
    const { data: visitRecords } = await supabase
      .from('visit_records')
      .select('session_id, needs_review')
      .in('session_id', sessionIds);

    reviewMap = new Map((visitRecords || []).map(vr => [vr.session_id, vr.needs_review]));
  }

  const enriched = sessionList.map(s => ({
    ...s,
    ...(patientMap ? { patient_name: patientMap.get(s.patient_id) || 'Unknown' } : {}),
    ...(reviewMap ? { needs_review: reviewMap.get(s.id) || false } : {}),
  }));

  return { sessions: enriched };
}
