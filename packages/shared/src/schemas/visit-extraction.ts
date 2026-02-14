import { z } from 'zod';

export const SymptomSchema = z.object({
  name: z.string(),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  duration: z.string().optional(),
  frequency: z.string().optional(),
  notes: z.string().optional(),
});

export const VitalsSchema = z.object({
  blood_pressure: z.string().optional(),
  heart_rate: z.string().optional(),
  temperature: z.string().optional(),
  respiratory_rate: z.string().optional(),
  oxygen_saturation: z.string().optional(),
  weight: z.string().optional(),
});

export const RecommendationSchema = z.object({
  type: z.enum(['test', 'medication', 'lifestyle', 'referral', 'follow_up', 'other']),
  description: z.string(),
  urgency: z.enum(['routine', 'soon', 'urgent']).optional(),
  notes: z.string().optional(),
});

export const VisitExtractionSchema = z.object({
  chief_complaint: z.string(),
  symptoms: z.array(SymptomSchema).default([]),
  vitals: VitalsSchema.optional(),
  assessment: z.string(),
  diagnoses: z.array(z.object({
    condition: z.string(),
    confidence: z.enum(['suspected', 'probable', 'confirmed']).optional(),
  })).default([]),
  recommendations: z.array(RecommendationSchema).default([]),
  follow_up: z.string().optional(),
  red_flags: z.array(z.string()).default([]),
  medication_changes: z.array(z.object({
    medication: z.string(),
    action: z.enum(['start', 'stop', 'modify', 'continue']),
    details: z.string().optional(),
  })).default([]),
});

export type Symptom = z.infer<typeof SymptomSchema>;
export type Vitals = z.infer<typeof VitalsSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type VisitExtraction = z.infer<typeof VisitExtractionSchema>;
