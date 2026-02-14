import { createServiceClient } from '@second-opinion/shared';
import type { UpdatePatientParams } from '../types';

export const updatePatientDefinition = {
  name: 'update_patient',
  description: 'Update a patient profile. Can set fields directly or merge new conditions/medications/allergies (deduplicating with existing values).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      patient_id: { type: 'string', description: 'The patient UUID' },
      full_name: { type: 'string' },
      date_of_birth: { type: 'string' },
      gender: { type: 'string' },
      phone: { type: 'string' },
      blood_type: { type: 'string' },
      emergency_contact: { type: 'object' },
      new_conditions: { type: 'array', items: { type: 'string' }, description: 'New chronic conditions to merge' },
      new_medications: { type: 'array', items: { type: 'string' }, description: 'New medications to merge' },
      new_allergies: { type: 'array', items: { type: 'string' }, description: 'New allergies to merge' },
    },
    required: ['patient_id'],
  },
};

export async function updatePatient(params: UpdatePatientParams): Promise<{ patient_id: string }> {
  const supabase = createServiceClient();

  // Build direct updates
  const directUpdates: Record<string, unknown> = {};
  if (params.full_name !== undefined) directUpdates.full_name = params.full_name;
  if (params.date_of_birth !== undefined) directUpdates.date_of_birth = params.date_of_birth;
  if (params.gender !== undefined) directUpdates.gender = params.gender;
  if (params.phone !== undefined) directUpdates.phone = params.phone;
  if (params.blood_type !== undefined) directUpdates.blood_type = params.blood_type;
  if (params.emergency_contact !== undefined) directUpdates.emergency_contact = params.emergency_contact;

  // Handle merge arrays
  const hasMerge = params.new_conditions?.length || params.new_medications?.length || params.new_allergies?.length;

  if (hasMerge) {
    const { data: patient } = await supabase
      .from('patients')
      .select('chronic_conditions, current_medications, allergies')
      .eq('id', params.patient_id)
      .single();

    if (!patient) throw new Error('Patient not found');

    if (params.new_conditions?.length) {
      const existing = (patient.chronic_conditions || []) as string[];
      directUpdates.chronic_conditions = [...new Set([...existing, ...params.new_conditions])];
    }
    if (params.new_medications?.length) {
      const existing = (patient.current_medications || []) as string[];
      directUpdates.current_medications = [...new Set([...existing, ...params.new_medications])];
    }
    if (params.new_allergies?.length) {
      const existing = (patient.allergies || []) as string[];
      directUpdates.allergies = [...new Set([...existing, ...params.new_allergies])];
    }
  }

  if (Object.keys(directUpdates).length > 0) {
    const { error } = await supabase
      .from('patients')
      .update(directUpdates)
      .eq('id', params.patient_id);

    if (error) throw new Error(`Failed to update patient: ${error.message}`);
  }

  return { patient_id: params.patient_id };
}
