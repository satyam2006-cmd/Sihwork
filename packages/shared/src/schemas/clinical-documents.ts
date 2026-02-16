import { z } from 'zod';

// ─── Sub-schemas ───

export const DiagnosisICDSchema = z.object({
  code: z.string().optional(),
  description: z.string(),
  type: z.enum(['primary', 'secondary', 'rule_out']).optional(),
});

export const ProcedureCPTSchema = z.object({
  code: z.string().optional(),
  description: z.string(),
});

export const OrderSchema = z.object({
  type: z.enum(['lab', 'imaging', 'referral', 'procedure', 'other']),
  description: z.string(),
  urgency: z.enum(['routine', 'urgent', 'stat']).optional(),
});

export const PrescriptionSchema = z.object({
  medication: z.string(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  duration: z.string().optional(),
});

export const ReviewOfSystemsSchema = z.record(z.string(), z.string());

// ─── SOAP Note ───

export const SOAPNoteSchema = z.object({
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
});

// ─── EHR Entry ───

export const EHREntrySchema = z.object({
  encounter_date: z.string().optional(),
  encounter_type: z.enum(['virtual_consultation', 'follow_up', 'urgent', 'emergency']).default('virtual_consultation'),
  chief_complaint: z.string(),
  history_of_present_illness: z.string(),
  past_medical_history: z.string().optional(),
  review_of_systems: ReviewOfSystemsSchema.optional(),
  physical_exam: z.string().optional(),
  assessment_and_plan: z.string(),
  diagnoses_icd: z.array(DiagnosisICDSchema).default([]),
  procedures_cpt: z.array(ProcedureCPTSchema).default([]),
  orders: z.array(OrderSchema).default([]),
  prescriptions: z.array(PrescriptionSchema).default([]),
  follow_up_instructions: z.string().optional(),
});

// ─── Clinical Letter ───

export const ClinicalLetterSchema = z.object({
  letter_type: z.enum(['referral', 'clinical_summary', 'follow_up', 'disability', 'insurance', 'specialist', 'other']),
  recipient_name: z.string().optional(),
  recipient_title: z.string().optional(),
  recipient_institution: z.string().optional(),
  subject_line: z.string(),
  body: z.string(),
});

// ─── Inferred types ───

export type SOAPNote = z.infer<typeof SOAPNoteSchema>;
export type EHREntry = z.infer<typeof EHREntrySchema>;
export type ClinicalLetter = z.infer<typeof ClinicalLetterSchema>;
export type DiagnosisICD = z.infer<typeof DiagnosisICDSchema>;
export type ProcedureCPT = z.infer<typeof ProcedureCPTSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type Prescription = z.infer<typeof PrescriptionSchema>;
export type ReviewOfSystems = z.infer<typeof ReviewOfSystemsSchema>;
