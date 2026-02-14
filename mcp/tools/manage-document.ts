import { createServiceClient } from '@second-opinion/shared';
import type { ManageDocumentParams } from '../types';

export const manageDocumentDefinition = {
  name: 'manage_document',
  description: 'Manage document records. Actions: create (after storage upload), update_status (processing/processed/failed), get (with optional ownership verification).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create', 'update_status', 'get'], description: 'Action to perform' },
      patient_id: { type: 'string', description: 'Patient UUID (for create)' },
      file_name: { type: 'string' },
      file_path: { type: 'string' },
      file_size: { type: 'number' },
      mime_type: { type: 'string' },
      document_id: { type: 'string', description: 'Document UUID (for update_status and get)' },
      status: { type: 'string', enum: ['uploaded', 'processing', 'processed', 'failed'] },
      extracted_data: { description: 'Extracted document data (for update_status with processed)' },
      extraction_error: { type: 'string', description: 'Error message (for update_status with failed)' },
      verify_owner_user_id: { type: 'string', description: 'Verify document belongs to this user (for get)' },
    },
    required: ['action'],
  },
};

export async function manageDocument(params: ManageDocumentParams): Promise<{ document: Record<string, unknown> }> {
  const supabase = createServiceClient();

  switch (params.action) {
    case 'create': {
      if (!params.patient_id || !params.file_name || !params.file_path || !params.mime_type) {
        throw new Error('create requires patient_id, file_name, file_path, mime_type');
      }

      const { data, error } = await supabase
        .from('documents')
        .insert({
          patient_id: params.patient_id,
          file_name: params.file_name,
          file_path: params.file_path,
          file_size: params.file_size || 0,
          mime_type: params.mime_type,
          status: 'uploaded',
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create document: ${error.message}`);
      return { document: data };
    }

    case 'update_status': {
      if (!params.document_id || !params.status) {
        throw new Error('update_status requires document_id and status');
      }

      const updates: Record<string, unknown> = { status: params.status };
      if (params.status === 'processed') {
        updates.extracted_data = params.extracted_data || null;
        updates.processed_at = new Date().toISOString();
        if (params.extracted_summary) {
          updates.extracted_summary = params.extracted_summary;
        }
      }
      if (params.status === 'failed') {
        updates.extraction_error = params.extraction_error || 'Unknown error';
      }

      const { data, error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', params.document_id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update document: ${error.message}`);
      return { document: data };
    }

    case 'get': {
      if (!params.document_id) {
        throw new Error('get requires document_id');
      }

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', params.document_id)
        .single();

      if (error || !data) throw new Error('Document not found');

      // Ownership verification
      if (params.verify_owner_user_id) {
        const { data: patient } = await supabase
          .from('patients')
          .select('user_id')
          .eq('id', data.patient_id)
          .single();

        if (!patient || patient.user_id !== params.verify_owner_user_id) {
          throw new Error('Document not found');
        }
      }

      return { document: data };
    }

    default:
      throw new Error(`Unknown action: ${params.action}`);
  }
}
