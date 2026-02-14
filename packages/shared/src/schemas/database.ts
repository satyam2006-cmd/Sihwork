import { z } from 'zod';

export const PatientSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  full_name: z.string(),
  date_of_birth: z.string().nullable(),
  gender: z.string().nullable(),
  phone: z.string().nullable(),
  blood_type: z.string().nullable(),
  allergies: z.array(z.string()).default([]),
  chronic_conditions: z.array(z.string()).default([]),
  current_medications: z.array(z.string()).default([]),
  emergency_contact: z.record(z.string()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  file_name: z.string(),
  file_path: z.string(),
  file_size: z.number(),
  mime_type: z.string(),
  status: z.enum(['uploaded', 'processing', 'processed', 'failed']),
  extracted_data: z.any().nullable(),
  extraction_error: z.string().nullable(),
  uploaded_at: z.string(),
  processed_at: z.string().nullable(),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  status: z.enum(['active', 'completed', 'abandoned']),
  mode: z.enum(['text', 'voice']),
  language: z.string().default('en'),
  transcript: z.array(z.any()).default([]),
  emergency_flagged: z.boolean().default(false),
  emergency_details: z.string().nullable(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  metadata: z.record(z.any()).default({}),
});

export type Patient = z.infer<typeof PatientSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type Session = z.infer<typeof SessionSchema>;
