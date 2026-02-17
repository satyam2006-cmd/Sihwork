import { WebSocket } from "ws";
import { speechToText } from "@second-opinion/shared";
import type { ChatMessage } from "@second-opinion/shared";
import { updateSession } from "../mcp/tools/index";
import { randomUUID } from "crypto";

const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB

export class ScribeSessionManager {
  private ws: WebSocket;
  private sessionId: string;
  private patientId: string;
  private language: string = "en";
  private audioMimeType: string = "audio/webm";
  private isProcessing: boolean = false;
  private isEnded: boolean = false;
  private transcript: ChatMessage[] = [];

  constructor(ws: WebSocket, sessionId: string, patientId: string) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.patientId = patientId;
  }

  async initialize(): Promise<void> {
    this.sendMessage({ type: "status", data: { status: "ready", message: "Scribe session ready" } });
  }

  async handleAudio(audioBuffer: Buffer): Promise<void> {
    if (this.isProcessing) {
      // Skip if still processing previous chunk to prevent pile-up
      return;
    }

    if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
      this.sendMessage({ type: "error", text: "Audio chunk too large" });
      return;
    }

    this.isProcessing = true;

    try {
      const asrResult = await speechToText(audioBuffer, this.audioMimeType);

      if (!asrResult.transcript.trim()) {
        return; // Empty chunk, skip
      }

      // Update language from ASR detection
      if (asrResult.language_code) {
        this.language = asrResult.language_code;
      }

      const message: ChatMessage = {
        id: randomUUID(),
        role: "user", // All scribe chunks stored as 'user' — no assistant in scribe mode
        content: asrResult.transcript,
        timestamp: new Date().toISOString(),
        language: this.language,
      };

      this.transcript.push(message);

      // Send transcript update to client
      this.sendMessage({
        type: "transcript",
        role: "user",
        text: asrResult.transcript,
        language: this.language,
      });

      // Persist transcript to DB
      await this.saveTranscript();
    } catch (error) {
      console.error("Scribe audio processing error:", error);
      this.sendMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Audio processing failed",
      });
    } finally {
      this.isProcessing = false;
    }
  }

  setLanguage(language: string): void {
    this.language = language;
  }

  setAudioMimeType(mimeType: string): void {
    this.audioMimeType = mimeType;
  }

  async endSession(): Promise<void> {
    if (this.isEnded) return;
    this.isEnded = true;

    try {
      await this.saveTranscript();
    } catch (error) {
      console.error("Scribe end session error:", error);
    }
  }

  private async saveTranscript(): Promise<void> {
    try {
      await updateSession({
        session_id: this.sessionId,
        transcript: this.transcript,
        language: this.language,
      });
    } catch (error) {
      console.error("Scribe save transcript error:", error);
    }
  }

  private sendMessage(msg: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
