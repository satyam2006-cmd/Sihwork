import { createServiceClient } from '../supabase/server';
import type { EHRContext } from '../prompts/system-prompt';

export async function hydrateEHRContext(patientId: string): Promise<EHRContext> {
  // Import getPatient dynamically to avoid circular dependency issues
  // The mcp tools import from @second-opinion/shared, so we use Supabase directly here
  // to avoid the circular dep. This is the one place where direct Supabase access
  // is justified for EHR hydration — it needs a complex query shape.
  const supabase = createServiceClient();

  // Fetch patient record
  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single();

  if (!patient) {
    throw new Error(`Patient not found: ${patientId}`);
  }

  // Fetch processed documents
  const { data: documents } = await supabase
    .from('documents')
    .select('file_name, extracted_data, uploaded_at')
    .eq('patient_id', patientId)
    .eq('status', 'processed')
    .order('uploaded_at', { ascending: false });

  // Fetch prior session summaries (last 5)
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      started_at,
      session_summaries(summary_text, key_findings, follow_up_items)
    `)
    .eq('patient_id', patientId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(5);

  const priorSessions = (sessions || []).map((s: Record<string, unknown>) => {
    const summary = Array.isArray(s.session_summaries)
      ? s.session_summaries[0]
      : s.session_summaries;
    return {
      started_at: s.started_at as string,
      summary_text: summary?.summary_text,
      key_findings: summary?.key_findings,
      follow_up_items: summary?.follow_up_items,
    };
  }).filter((s: { summary_text?: string }) => s.summary_text);

  return {
    patient: {
      full_name: patient.full_name,
      date_of_birth: patient.date_of_birth,
      gender: patient.gender,
      blood_type: patient.blood_type,
      allergies: patient.allergies || [],
      chronic_conditions: patient.chronic_conditions || [],
      current_medications: patient.current_medications || [],
    },
    documents: documents || [],
    priorSessions,
  };
}
