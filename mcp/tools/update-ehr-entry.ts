import { createServiceClient } from '@second-opinion/shared';
import type { UpdateEHREntryParams } from '../types';

export const updateEHREntryDefinition = {
  name: 'update_ehr_entry',
  description: 'Update an EHR entry (doctor edits or finalization).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ehr_entry_id: { type: 'string', description: 'The EHR entry UUID' },
      encounter_date: { type: 'string' },
      encounter_type: { type: 'string', enum: ['virtual_consultation', 'follow_up', 'urgent', 'emergency'] },
      chief_complaint: { type: 'string' },
      history_of_present_illness: { type: 'string' },
      past_medical_history: { type: 'string' },
      review_of_systems: { type: 'object' },
      physical_exam: { type: 'string' },
      assessment_and_plan: { type: 'string' },
      diagnoses_icd: { type: 'array' },
      procedures_cpt: { type: 'array' },
      orders: { type: 'array' },
      prescriptions: { type: 'array' },
      follow_up_instructions: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'edited', 'finalized'] },
    },
    required: ['ehr_entry_id'],
  },
};

export async function updateEHREntry(params: UpdateEHREntryParams): Promise<{ success: boolean }> {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = {};
  if (params.encounter_date !== undefined) update.encounter_date = params.encounter_date;
  if (params.encounter_type !== undefined) update.encounter_type = params.encounter_type;
  if (params.chief_complaint !== undefined) update.chief_complaint = params.chief_complaint;
  if (params.history_of_present_illness !== undefined) update.history_of_present_illness = params.history_of_present_illness;
  if (params.past_medical_history !== undefined) update.past_medical_history = params.past_medical_history;
  if (params.review_of_systems !== undefined) update.review_of_systems = params.review_of_systems;
  if (params.physical_exam !== undefined) update.physical_exam = params.physical_exam;
  if (params.assessment_and_plan !== undefined) update.assessment_and_plan = params.assessment_and_plan;
  if (params.diagnoses_icd !== undefined) update.diagnoses_icd = params.diagnoses_icd;
  if (params.procedures_cpt !== undefined) update.procedures_cpt = params.procedures_cpt;
  if (params.orders !== undefined) update.orders = params.orders;
  if (params.prescriptions !== undefined) update.prescriptions = params.prescriptions;
  if (params.follow_up_instructions !== undefined) update.follow_up_instructions = params.follow_up_instructions;
  if (params.status !== undefined) {
    update.status = params.status;
    if (params.status === 'finalized') {
      update.finalized_at = new Date().toISOString();
    }
  }
  update.edited_at = new Date().toISOString();

  const { error } = await supabase
    .from('ehr_entries')
    .update(update)
    .eq('id', params.ehr_entry_id);

  if (error) throw new Error(`Failed to update EHR entry: ${error.message}`);
  return { success: true };
}
