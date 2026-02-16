import { createServiceClient } from '@second-opinion/shared';
import type { WriteEHREntryParams } from '../types';

export const writeEHREntryDefinition = {
  name: 'write_ehr_entry',
  description: 'Write a formal EHR encounter entry for a completed session. One per session.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID' },
      patient_id: { type: 'string', description: 'The patient UUID' },
      encounter_date: { type: 'string', description: 'Date of encounter (YYYY-MM-DD)' },
      encounter_type: { type: 'string', enum: ['virtual_consultation', 'follow_up', 'urgent', 'emergency'] },
      chief_complaint: { type: 'string', description: 'Primary reason for visit' },
      history_of_present_illness: { type: 'string', description: 'HPI narrative (OLDCARTS)' },
      past_medical_history: { type: 'string', description: 'Relevant PMH' },
      review_of_systems: { type: 'object', description: 'ROS by system {system: findings}' },
      physical_exam: { type: 'string', description: 'Physical exam findings' },
      assessment_and_plan: { type: 'string', description: 'Assessment and plan organized by problem' },
      diagnoses_icd: { type: 'array', description: 'ICD diagnoses [{code?, description, type?}]' },
      procedures_cpt: { type: 'array', description: 'CPT procedures [{code?, description}]' },
      orders: { type: 'array', description: 'Orders [{type, description, urgency?}]' },
      prescriptions: { type: 'array', description: 'Prescriptions [{medication, dosage?, frequency?, duration?}]' },
      follow_up_instructions: { type: 'string', description: 'Follow-up instructions' },
    },
    required: ['session_id', 'patient_id', 'chief_complaint', 'history_of_present_illness', 'assessment_and_plan'],
  },
};

export async function writeEHREntry(params: WriteEHREntryParams): Promise<{ id: string }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('ehr_entries')
    .insert({
      session_id: params.session_id,
      patient_id: params.patient_id,
      encounter_date: params.encounter_date || new Date().toISOString().split('T')[0],
      encounter_type: params.encounter_type || 'virtual_consultation',
      chief_complaint: params.chief_complaint,
      history_of_present_illness: params.history_of_present_illness,
      past_medical_history: params.past_medical_history || null,
      review_of_systems: params.review_of_systems || null,
      physical_exam: params.physical_exam || null,
      assessment_and_plan: params.assessment_and_plan,
      diagnoses_icd: params.diagnoses_icd || [],
      procedures_cpt: params.procedures_cpt || [],
      orders: params.orders || [],
      prescriptions: params.prescriptions || [],
      follow_up_instructions: params.follow_up_instructions || null,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to write EHR entry: ${error.message}`);
  return { id: data.id };
}
