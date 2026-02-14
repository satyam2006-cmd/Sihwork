import { getSarvamConfig } from './client';

export async function textToSpeech(
  text: string,
  targetLanguage: string = 'en-IN'
): Promise<Buffer> {
  const config = getSarvamConfig();

  const response = await fetch(`${config.baseUrl}/text-to-speech`, {
    method: 'POST',
    headers: config.headers,
    body: JSON.stringify({
      inputs: [text],
      target_language_code: targetLanguage,
      model: 'bulbul:v2',
      speaker: 'anushka',
      pitch: 0,
      pace: 1.0,
      loudness: 1.0,
      enable_preprocessing: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Sarvam TTS error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return Buffer.from(result.audios[0], 'base64');
}
