import { getSarvamConfig } from './client';

export interface ASRResult {
  transcript: string;
  language_code: string;
}

export async function speechToText(audioBuffer: Buffer): Promise<ASRResult> {
  const config = getSarvamConfig();

  const formData = new FormData();
  const audioBlob = new Blob([new Uint8Array(audioBuffer) as BlobPart], { type: 'audio/wav' });
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'saaras:v3');
  formData.append('language_code', 'unknown');

  const response = await fetch(`${config.baseUrl}/speech-to-text`, {
    method: 'POST',
    headers: {
      'api-subscription-key': config.apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Sarvam ASR error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return {
    transcript: result.transcript,
    language_code: result.language_code || 'en',
  };
}
