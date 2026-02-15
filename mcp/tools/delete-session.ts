import { createServiceClient } from '@second-opinion/shared';
import type { DeleteSessionParams } from '../types';

export const deleteSessionDefinition = {
  name: 'delete_session',
  description: 'Delete a session and its related records (visit record, session summary).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'The session UUID' },
    },
    required: ['session_id'],
  },
};

export async function deleteSession(params: DeleteSessionParams): Promise<{ deleted: boolean }> {
  const supabase = createServiceClient();

  // Delete related records first
  await supabase.from('session_summaries').delete().eq('session_id', params.session_id);
  await supabase.from('visit_records').delete().eq('session_id', params.session_id);

  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', params.session_id);

  if (error) throw new Error(`Failed to delete session: ${error.message}`);
  return { deleted: true };
}
