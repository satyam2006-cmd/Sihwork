import { getSarvamConfig } from './client';

export interface ASRResult {
  transcript: string;
  language_code: string;
}

const ASR_TIMEOUT_MS = 15_000;

export async function speechToText(audioBuffer: Buffer, mimeType: string = 'audio/webm'): Promise<ASRResult> {
  const config = getSarvamConfig();

  const ext = mimeTypeToExtension(mimeType);
  const formData = new FormData();
  const audioBlob = new Blob([new Uint8Array(audioBuffer) as BlobPart], { type: mimeType });
  formData.append('file', audioBlob, `audio${ext}`);
  formData.append('model', 'saaras:v3');
  formData.append('language_code', 'unknown');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASR_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/speech-to-text`, {
      method: 'POST',
      headers: {
        'api-subscription-key': config.apiKey,
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Speech recognition timed out. Please try again.');
    }
    throw new Error('Speech recognition service unavailable. Please try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new Error('Speech recognition rate limited. Please wait a moment and try again.');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Speech recognition failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (!result?.transcript || typeof result.transcript !== 'string') {
    throw new Error('Speech recognition returned empty result. Please try again.');
  }

  return {
    transcript: result.transcript,
    language_code: result.language_code || 'en',
  };
}

function mimeTypeToExtension(mimeType: string): string {
  const base = mimeType.split(';')[0].trim();
  switch (base) {
    case 'audio/mp4': return '.mp4';
    case 'audio/ogg': return '.ogg';
    case 'audio/wav': return '.wav';
    case 'audio/webm':
    default: return '.webm';
  }
}
