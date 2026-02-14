import { WebSocket } from "ws";
import { ConversationEngine, hydrateEHRContext } from "@second-opinion/shared";
import { updateSession } from "../mcp/tools/index";
import { processUtterance, generateGreetingAudio } from "./audio-pipeline";

export class SessionManager {
  private ws: WebSocket;
  private engine: ConversationEngine | null = null;
  private sessionId: string;
  private patientId: string;
  private language: string = "en";
  private isProcessing: boolean = false;

  constructor(ws: WebSocket, sessionId: string, patientId: string) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.patientId = patientId;
  }

  async initialize(): Promise<void> {
    try {
      this.sendStatus("setting_up", "Loading your medical history...");

      // Hydrate EHR context
      const ehrContext = await hydrateEHRContext(this.patientId);
      this.engine = new ConversationEngine(ehrContext);

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
    } catch (error) {
      console.error("Session initialization error:", error);
      this.sendError("Failed to initialize session. Please try again.");
    }
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

    this.isProcessing = true;
    this.sendStatus("processing", "Processing your message...");

    try {
      const result = await processUtterance(
        audioBuffer,
        this.engine,
        this.language
      );

      // Update language preference
      this.language = result.language;

      // Send transcript of what user said
      this.sendMessage({
        type: "transcript",
        text: result.transcript,
        language: result.language,
      });

      // Send response
      this.sendMessage({
        type: "transcript",
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

  async endSession(): Promise<void> {
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
