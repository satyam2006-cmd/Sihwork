import { z } from 'zod';

export const LabResultSchema = z.object({
  test_name: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  reference_range: z.string().optional(),
  flag: z.enum(['normal', 'high', 'low', 'critical']).optional(),
  date: z.string().optional(),
});

export const MedicationSchema = z.object({
  name: z.string(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  prescribed_for: z.string().optional(),
  start_date: z.string().optional(),
});

export const DiagnosisSchema = z.object({
  condition: z.string(),
  date: z.string().optional(),
  status: z.enum(['active', 'resolved', 'chronic']).optional(),
  notes: z.string().optional(),
});

export const DocumentExtractionSchema = z.object({
  document_type: z.enum(['lab_report', 'prescription', 'discharge_summary', 'imaging_report', 'clinical_notes', 'other']),
  patient_name: z.string().optional(),
  date: z.string().optional(),
  institution: z.string().optional(),
  lab_results: z.array(LabResultSchema).default([]),
  medications: z.array(MedicationSchema).default([]),
  diagnoses: z.array(DiagnosisSchema).default([]),
  vitals: z.record(z.string()).optional(),
  summary: z.string().optional(),
  raw_findings: z.array(z.string()).default([]),
});

export type LabResult = z.infer<typeof LabResultSchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;
