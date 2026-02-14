import { createServiceClient } from '@second-opinion/shared';
import type { UpdateSessionParams } from '../types';

export const updateSessionDefinition = {
  name: 'update_session',
  description: 'Update a session. Can update transcript, status, language, emergency flags, metadata. Use complete=true as shorthand to set status=completed and ended_at=now().',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID' },
      transcript: { type: 'array', description: 'Updated transcript messages' },
      status: { type: 'string', enum: ['active', 'completed', 'abandoned'] },
      language: { type: 'string' },
      emergency_flagged: { type: 'boolean' },
      emergency_details: { type: 'string' },
      metadata: { type: 'object', description: 'Session metadata to merge' },
      complete: { type: 'boolean', description: 'Shorthand: set status=completed + ended_at=now()' },
    },
    required: ['session_id'],
  },
};

export async function updateSession(params: UpdateSessionParams): Promise<{ session_id: string }> {
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};

  if (params.transcript !== undefined) updates.transcript = params.transcript;
  if (params.status !== undefined) updates.status = params.status;
  if (params.language !== undefined) updates.language = params.language;
  if (params.emergency_flagged !== undefined) updates.emergency_flagged = params.emergency_flagged;
  if (params.emergency_details !== undefined) updates.emergency_details = params.emergency_details;

  // Merge metadata with existing
  if (params.metadata !== undefined) {
    const { data: existing } = await supabase
      .from('sessions')
      .select('metadata')
      .eq('id', params.session_id)
      .single();

    updates.metadata = { ...(existing?.metadata || {}), ...params.metadata };
  }

  // Complete shorthand
  if (params.complete) {
    updates.status = 'completed';
    updates.ended_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return { session_id: params.session_id };
  }

  const { error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', params.session_id);

  if (error) throw new Error(`Failed to update session: ${error.message}`);
  return { session_id: params.session_id };
}
