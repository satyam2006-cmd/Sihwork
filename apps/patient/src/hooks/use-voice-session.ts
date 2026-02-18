import { useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/utils";

export type VoiceSessionState =
  | "idle"
  | "initializing"
  | "ready"
  | "listening"
  | "processing"
  | "speaking"
  | "failed";

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

interface UseVoiceSessionOptions {
  sessionId: string;
  onTranscript?: (entry: TranscriptEntry) => void;
  onEmergency?: (details: string | null) => void;
  playAudio: (base64Audio: string) => Promise<void>;
}

export function useVoiceSession({
  sessionId,
  onTranscript,
  onEmergency,
  playAudio,
}: UseVoiceSessionOptions) {
  const [state, setState] = useState<VoiceSessionState>("idle");
  const [isEmergency, setIsEmergency] = useState(false);
  const stateRef = useRef<VoiceSessionState>("idle");
  stateRef.current = state;

  const updateState = useCallback((newState: VoiceSessionState) => {
    stateRef.current = newState;
    setState(newState);
  }, []);

  // Initialize session: fetch greeting + play audio
  const initialize = useCallback(async () => {
    updateState("initializing");

    try {
      const res = await apiFetch(`/api/session/${sessionId}/greeting`, {
        method: "POST",
      });

      if (!res.ok) {
        updateState("failed");
        return;
      }

      const data = await res.json();

      // Add greeting to transcript
      onTranscript?.({
        role: "assistant",
        text: data.text,
        timestamp: new Date(),
      });

      // Play greeting audio
      if (data.audio) {
        updateState("speaking");
        try {
          await playAudio(data.audio);
        } catch {
          // Audio playback failed, continue to ready
        }
      }

      if (stateRef.current === "speaking" || stateRef.current === "initializing") {
        updateState("ready");
      }
    } catch (error) {
      console.error("Failed to initialize voice session:", error);
      updateState("failed");
    }
  }, [sessionId, onTranscript, playAudio, updateState]);

  // Send recorded audio through the pipeline: ASR -> Chat (SSE) -> TTS -> play
  const sendAudio = useCallback(
    async (audioBuffer: ArrayBuffer, mimeType: string) => {
      updateState("processing");

      try {
        // Step 1: ASR — transcribe audio to text
        const asrRes = await apiFetch(`/api/session/${sessionId}/transcribe`, {
          method: "POST",
          headers: { "Content-Type": mimeType },
          body: audioBuffer,
        });

        if (!asrRes.ok) {
          console.error("ASR failed:", await asrRes.text());
          updateState("ready");
          return;
        }

        const { transcript: userText, language_code } = await asrRes.json();

        // Add user transcript
        onTranscript?.({
          role: "user",
          text: userText,
          timestamp: new Date(),
        });

        // Step 2: Chat — stream Claude's response via SSE
        const chatRes = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            message: userText,
          }),
        });

        if (!chatRes.ok || !chatRes.body) {
          console.error("Chat failed:", chatRes.status);
          updateState("ready");
          return;
        }

        // Read SSE stream
        let assistantText = "";
        let chatIsEmergency = false;
        let chatEmergencyDetails: string | null = null;

        const reader = chatRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const processSSELine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              assistantText += event.content;
            } else if (event.type === "done") {
              assistantText = event.content || assistantText;
              chatIsEmergency = event.isEmergency || false;
              chatEmergencyDetails = event.emergencyDetails || null;
            } else if (event.type === "error") {
              console.error("Chat SSE error event:", event.content);
            }
          } catch {
            // Skip malformed SSE lines
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            processSSELine(line);
          }
        }

        // Flush decoder and process any remaining buffered data
        buffer += decoder.decode();
        if (buffer.trim()) {
          processSSELine(buffer);
        }

        if (!assistantText) {
          updateState("ready");
          return;
        }

        // Add assistant transcript
        onTranscript?.({
          role: "assistant",
          text: assistantText,
          timestamp: new Date(),
        });

        // Handle emergency
        if (chatIsEmergency) {
          setIsEmergency(true);
          onEmergency?.(chatEmergencyDetails);
        }

        // Step 3: TTS — synthesize response audio
        const languageCode = language_code === "en" ? "en-IN" : `${language_code}-IN`;
        try {
          const ttsRes = await apiFetch(`/api/session/${sessionId}/synthesize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: assistantText,
              language: languageCode,
            }),
          });

          if (ttsRes.ok) {
            const { audio } = await ttsRes.json();
            if (audio) {
              updateState("speaking");
              try {
                await playAudio(audio);
              } catch (playErr) {
                console.error("Audio playback failed:", playErr);
              }
            } else {
              console.error("TTS returned OK but no audio data");
            }
          } else {
            console.error("TTS synthesis failed:", ttsRes.status, await ttsRes.text().catch(() => ""));
          }
        } catch (ttsErr) {
          console.error("TTS request error:", ttsErr);
        }

        if (stateRef.current === "speaking" || stateRef.current === "processing") {
          updateState("ready");
        }
      } catch (error) {
        console.error("Voice pipeline error:", error);
        if (stateRef.current !== "idle") {
          updateState("ready");
        }
      }
    },
    [sessionId, onTranscript, onEmergency, playAudio, updateState]
  );

  // End the session
  const endSession = useCallback(async () => {
    apiFetch(`/api/session/${sessionId}/complete`, { method: "POST" }).catch(
      () => {}
    );
  }, [sessionId]);

  return {
    state,
    isEmergency,
    initialize,
    sendAudio,
    endSession,
  };
}
