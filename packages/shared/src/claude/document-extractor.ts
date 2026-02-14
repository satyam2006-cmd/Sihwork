import { getAnthropicClient } from './client';
import { DocumentExtractionSchema, type DocumentExtraction } from '../schemas/document-extraction';
import { DOCUMENT_EXTRACTION_SYSTEM_PROMPT } from '../prompts/extraction-prompt';

export async function extractDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<DocumentExtraction> {
  const client = getAnthropicClient();

  const base64Data = fileBuffer.toString('base64');

  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
  type ImageType = typeof imageTypes[number];

  const isImage = imageTypes.includes(mimeType as ImageType);

  const contentBlock = isImage
    ? {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mimeType as ImageType,
          data: base64Data,
        },
      }
    : {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: base64Data,
        },
      };

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: 'Extract all structured medical data from this document. Return only valid JSON.',
          },
        ],
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let jsonStr = textContent.text.trim();
  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);
  return DocumentExtractionSchema.parse(parsed);
}
