import { z } from 'zod';

export const ExtractionEvalSchema = z.object({
  faithfulness: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  correctness: z.number().min(0).max(1),
  consistency: z.number().min(0).max(1),
  overall_confidence: z.number().min(0).max(1),
  issues: z.array(z.object({
    field: z.string(),
    issue: z.string(),
    severity: z.enum(['minor', 'moderate', 'critical']),
  })).default([]),
});

export const ConversationEvalSchema = z.object({
  thoroughness: z.number().min(0).max(1),
  empathy: z.number().min(0).max(1),
  safety: z.number().min(0).max(1),
  accuracy: z.number().min(0).max(1),
  follow_up_quality: z.number().min(0).max(1),
  overall_quality: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export type ExtractionEval = z.infer<typeof ExtractionEvalSchema>;
export type ConversationEval = z.infer<typeof ConversationEvalSchema>;
