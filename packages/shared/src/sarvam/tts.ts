import { getSarvamConfig } from './client';

const TTS_TIMEOUT_MS = 15_000;

const SARVAM_MAX_CHARS = 500;

/**
 * Split text into chunks that fit within Sarvam's character limit.
 * Splits on sentence boundaries when possible.
 */
function splitTextForTTS(text: string): string[] {
  if (text.length <= SARVAM_MAX_CHARS) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= SARVAM_MAX_CHARS) {
      chunks.push(remaining);
      break;
    }

    // Find a sentence boundary within the limit
    const slice = remaining.slice(0, SARVAM_MAX_CHARS);
    let splitAt = -1;
    for (const sep of ['. ', '? ', '! ', '; ', ', ']) {
      const idx = slice.lastIndexOf(sep);
      if (idx > 0) {
        splitAt = idx + sep.length;
        break;
      }
    }
    // Fallback: split at last space
    if (splitAt === -1) {
      splitAt = slice.lastIndexOf(' ');
    }
    // Absolute fallback: hard split
    if (splitAt <= 0) {
      splitAt = SARVAM_MAX_CHARS;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return chunks.filter(c => c.length > 0);
}

async function ttsChunk(
  text: string,
  targetLanguage: string,
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

/**
 * Extract raw PCM data from a WAV buffer by finding the "data" sub-chunk.
 * Returns { header, pcm } where header is everything up to (and including)
 * the data chunk header, and pcm is the raw audio samples.
 */
function splitWav(wav: Buffer): { header: Buffer; pcm: Buffer } {
  // Search for "data" marker after the RIFF/WAVE header
  for (let i = 12; i < wav.length - 8; i++) {
    if (wav[i] === 0x64 && wav[i+1] === 0x61 && wav[i+2] === 0x74 && wav[i+3] === 0x61) { // "data"
      const headerEnd = i + 8; // "data" (4) + size (4)
      return { header: wav.subarray(0, headerEnd), pcm: wav.subarray(headerEnd) };
    }
  }
  // Fallback: assume standard 44-byte header
  return { header: wav.subarray(0, 44), pcm: wav.subarray(44) };
}

/**
 * Concatenate multiple WAV buffers into one by merging their PCM data
 * and fixing the RIFF/data size fields.
 */
function concatWavBuffers(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 1) return wavBuffers[0];

  const parts = wavBuffers.map(splitWav);
  const header = Buffer.from(parts[0].header);
  const pcmChunks = parts.map(p => p.pcm);
  const totalPcmSize = pcmChunks.reduce((sum, c) => sum + c.length, 0);

  // Update RIFF size (bytes 4-7): total file size - 8
  header.writeUInt32LE(header.length - 8 + totalPcmSize, 4);
  // Update data chunk size (last 4 bytes of header)
  header.writeUInt32LE(totalPcmSize, header.length - 4);

  return Buffer.concat([header, ...pcmChunks]);
}

export async function textToSpeech(
  text: string,
  targetLanguage: string = 'en-IN'
): Promise<Buffer> {
  const chunks = splitTextForTTS(text);

  if (chunks.length === 1) {
    return ttsChunk(chunks[0], targetLanguage);
  }

  // Process chunks sequentially to respect rate limits
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    const buf = await ttsChunk(chunk, targetLanguage);
    buffers.push(buf);
  }

  return concatWavBuffers(buffers);
}
