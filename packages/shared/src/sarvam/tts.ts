import { getSarvamConfig } from './client';

const TTS_TIMEOUT_MS = 15_000;

export async function textToSpeech(
  text: string,
  targetLanguage: string = 'en-IN'
): Promise<Buffer> {
  const config = getSarvamConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/text-to-speech`, {
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
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Text-to-speech timed out.');
    }
    throw new Error('Text-to-speech service unavailable.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new Error('Text-to-speech rate limited. Please wait a moment.');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Text-to-speech failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (!result?.audios?.[0]) {
    throw new Error('Text-to-speech returned empty audio.');
  }

  return Buffer.from(result.audios[0], 'base64');
}
