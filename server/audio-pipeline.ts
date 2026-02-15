import { speechToText } from "@second-opinion/shared";
import { textToSpeech } from "@second-opinion/shared";
import { ConversationEngine } from "@second-opinion/shared";

export interface PipelineResult {
  transcript: string;
  response: string;
  audioBuffer: Buffer | null;
  language: string;
  isEmergency: boolean;
  emergencyDetails: string | null;
}

export async function processUtterance(
  audioBuffer: Buffer,
  engine: ConversationEngine,
  preferredLanguage?: string
): Promise<PipelineResult> {
  // Step 1: Sarvam ASR → English transcript + detected language
  let transcript: string;
  let detectedLanguage: string;

  try {
    const asrResult = await speechToText(audioBuffer);
    transcript = asrResult.transcript;
    detectedLanguage = asrResult.language_code || preferredLanguage || "en";
  } catch (error) {
    console.error("ASR failed:", error);
    // Propagate the specific error from Sarvam (rate limit, timeout, etc.)
    if (error instanceof Error) throw error;
    throw new Error("Speech recognition failed. Please try again.");
  }

  if (!transcript.trim()) {
    throw new Error("Could not understand audio. Please try again.");
  }

  // Step 2: Claude conversation engine → response
  const { content: response, isEmergency, emergencyDetails } =
    await engine.sendMessage(transcript);

  // Step 3: Sarvam TTS (in detected language) → audio response
  let responseAudio: Buffer | null = null;
  try {
    // Map language codes for Sarvam TTS
    const ttsLanguage = mapLanguageForTTS(detectedLanguage);
    responseAudio = await textToSpeech(response, ttsLanguage);
  } catch (error) {
    console.error("TTS failed, returning text-only:", error);
    // Continue without audio - text fallback
  }

  return {
    transcript,
    response,
    audioBuffer: responseAudio,
    language: detectedLanguage,
    isEmergency,
    emergencyDetails,
  };
}

function mapLanguageForTTS(languageCode: string): string {
  const mapping: Record<string, string> = {
    en: "en-IN",
    hi: "hi-IN",
    "en-IN": "en-IN",
    "hi-IN": "hi-IN",
    english: "en-IN",
    hindi: "hi-IN",
  };
  return mapping[languageCode.toLowerCase()] || "en-IN";
}

export async function generateGreetingAudio(
  text: string,
  language: string = "en-IN"
): Promise<Buffer | null> {
  try {
    return await textToSpeech(text, language);
  } catch (error) {
    console.error("Greeting TTS failed:", error);
    return null;
  }
}
