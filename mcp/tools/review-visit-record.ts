import { createServiceClient } from '@second-opinion/shared';
import type { ReviewVisitRecordParams } from '../types';

export const reviewVisitRecordDefinition = {
  name: 'review_visit_record',
  description: 'Mark a visit record as reviewed. Clears needs_review flag and sets reviewed_at timestamp.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID whose visit record to review' },
    },
    required: ['session_id'],
  },
};

export async function reviewVisitRecord(params: ReviewVisitRecordParams): Promise<{ success: boolean }> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('visit_records')
    .update({
      needs_review: false,
      reviewed_at: new Date().toISOString(),
    })
    .eq('session_id', params.session_id);

  if (error) throw new Error(`Failed to review visit record: ${error.message}`);
  return { success: true };
}
