import { WebSocket } from "ws";
import { ConversationEngine, hydrateEHRContext } from "@second-opinion/shared";
import { updateSession } from "../mcp/tools/index";
import { processUtterance, generateGreetingAudio } from "./audio-pipeline";

const INIT_TIMEOUT_MS = 30_000;
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB

export class SessionManager {
  private ws: WebSocket;
  private engine: ConversationEngine | null = null;
  private sessionId: string;
  private patientId: string;
  private language: string = "en";
  private audioMimeType: string = "audio/webm";
  private isProcessing: boolean = false;
  private isEnded: boolean = false;

  constructor(ws: WebSocket, sessionId: string, patientId: string) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.patientId = patientId;
  }

  async initialize(): Promise<void> {
    try {
      this.sendStatus("setting_up", "Loading your medical history...");

      // Wrap initialization in a timeout so client doesn't hang forever
      let timer: ReturnType<typeof setTimeout>;
      const result = await Promise.race([
        this.doInitialize(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Initialization timed out")), INIT_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timer!);

      return result;
    } catch (error) {
      console.error("Session initialization error:", error);
      this.sendError("Failed to initialize session. Please try again.");
      this.sendStatus("failed", "Initialization failed");
    }
  }

  private async doInitialize(): Promise<void> {
    // Hydrate EHR context
    const ehrContext = await hydrateEHRContext(this.patientId);
    this.engine = new ConversationEngine(ehrContext, undefined, { useRouter: true });

    // Get greeting
    const greeting = await this.engine.getGreeting();

    // Generate greeting audio
    const greetingAudio = await generateGreetingAudio(greeting.content, "en-IN");

    // Send greeting
    this.sendMessage({
      type: "greeting",
      text: greeting.content,
      audio: greetingAudio ? greetingAudio.toString("base64") : undefined,
      sessionId: this.sessionId,
    });

    this.sendStatus("ready", "Ready for conversation");

    // Save initial transcript
    await this.saveTranscript();
  }

  async handleAudio(audioBuffer: Buffer): Promise<void> {
    if (!this.engine) {
      this.sendError("Session not initialized");
      return;
    }

    if (this.isProcessing) {
      this.sendError("Still processing previous message");
      return;
    }

    if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
      this.sendError("Audio too large. Please record a shorter message.");
      return;
    }

    this.isProcessing = true;
    this.sendStatus("processing", "Processing your message...");

    try {
      const result = await processUtterance(
        audioBuffer,
        this.engine,
        this.language,
        this.audioMimeType
      );

      // Update language preference
      this.language = result.language;

      // Send transcript of what user said
      this.sendMessage({
        type: "transcript",
        role: "user",
        text: result.transcript,
        language: result.language,
      });

      // Send response
      this.sendMessage({
        type: "transcript",
        role: "assistant",
        text: result.response,
        audio: result.audioBuffer
          ? result.audioBuffer.toString("base64")
          : undefined,
        language: result.language,
      });

      // Handle emergency
      if (result.isEmergency) {
        this.sendMessage({
          type: "emergency",
          text: result.emergencyDetails || "Emergency detected",
        });
      }

      // Save transcript via MCP tool
      await this.saveTranscript();

      this.sendStatus("ready", "Ready for conversation");
    } catch (error) {
      console.error("Audio processing error:", error);
      this.sendError(
        error instanceof Error ? error.message : "Processing failed"
      );
      this.sendStatus("ready", "Ready for conversation");
    } finally {
      this.isProcessing = false;
    }
  }

  async handleTextMessage(text: string): Promise<void> {
    if (!this.engine) {
      this.sendError("Session not initialized");
      return;
    }

    this.isProcessing = true;
    this.sendStatus("processing", "Processing...");

    try {
      const { content, isEmergency, emergencyDetails } =
        await this.engine.sendMessage(text);

      this.sendMessage({
        type: "transcript",
        role: "assistant",
        text: content,
      });

      if (isEmergency) {
        this.sendMessage({
          type: "emergency",
          text: emergencyDetails || "Emergency detected",
        });
      }

      await this.saveTranscript();
      this.sendStatus("ready", "Ready");
    } catch (error) {
      console.error("Text processing error:", error);
      this.sendError("Processing failed");
      this.sendStatus("ready", "Ready");
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
    // Guard against double-end (called from both "end" message and "close" event)
    if (this.isEnded) return;
    this.isEnded = true;

    try {
      await this.saveTranscript();

      // Mark session completed via MCP tool
      await updateSession({
        session_id: this.sessionId,
        complete: true,
        emergency_flagged: this.engine?.getIsEmergency() || false,
      });
    } catch (error) {
      console.error("End session error:", error);
    } finally {
      // Clean up engine resources
      this.engine?.destroy();
      this.engine = null;
    }
  }

  private async saveTranscript(): Promise<void> {
    if (!this.engine) return;

    try {
      const transcript = this.engine.getTranscript();
      await updateSession({
        session_id: this.sessionId,
        transcript,
        language: this.language,
        emergency_flagged: this.engine.getIsEmergency(),
      });
    } catch (error) {
      console.error("Save transcript error:", error);
    }
  }

  private sendMessage(msg: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendStatus(status: string, message: string): void {
    this.sendMessage({ type: "status", data: { status, message } });
  }

  private sendError(message: string): void {
    this.sendMessage({ type: "error", text: message });
  }
}
