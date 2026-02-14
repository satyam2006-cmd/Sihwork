import { createServiceClient } from '@second-opinion/shared';
import type { WriteVisitRecordParams } from '../types';

export const writeVisitRecordDefinition = {
  name: 'write_visit_record',
  description: 'Write a structured visit record for a completed session. Includes clinical data extracted from the consultation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID' },
      patient_id: { type: 'string', description: 'The patient UUID' },
      chief_complaint: { type: 'string', description: 'Primary reason for consultation' },
      symptoms: { type: 'array', description: 'Array of symptom objects' },
      vitals: { type: 'object', description: 'Vitals measurements (optional)' },
      assessment: { type: 'string', description: 'Clinical assessment' },
      diagnoses: { type: 'array', description: 'Array of diagnosis objects with condition and confidence' },
      recommendations: { type: 'array', description: 'Array of recommendation objects' },
      follow_up: { type: 'string', description: 'Follow-up plan' },
      red_flags: { type: 'array', items: { type: 'string' }, description: 'Concerning findings' },
      medication_changes: { type: 'array', description: 'Medication changes' },
      confidence_score: { type: 'number', description: 'Extraction confidence 0-1' },
      needs_review: { type: 'boolean', description: 'Whether a doctor should review' },
    },
    required: ['session_id', 'patient_id', 'chief_complaint', 'assessment', 'confidence_score', 'needs_review'],
  },
};

export async function writeVisitRecord(params: WriteVisitRecordParams): Promise<{ id: string }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('visit_records')
    .insert({
      session_id: params.session_id,
      patient_id: params.patient_id,
      chief_complaint: params.chief_complaint,
      symptoms: params.symptoms || [],
      vitals: params.vitals || null,
      assessment: params.assessment,
      recommendations: params.recommendations || [],
      diagnoses: params.diagnoses || [],
      follow_up: params.follow_up || null,
      source: 'ai_extraction',
      confidence_score: params.confidence_score,
      needs_review: params.needs_review,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to write visit record: ${error.message}`);
  return { id: data.id };
}
