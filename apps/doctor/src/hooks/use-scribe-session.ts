import { useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/utils";

export function useScribeSession(sessionId: string) {
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  const transcribe = useCallback(
    async (audioBuffer: ArrayBuffer, mimeType: string): Promise<{ transcript: string; language: string } | null> => {
      // Skip if previous transcription is still in-flight
      if (processingRef.current) return null;
      processingRef.current = true;
      setIsProcessing(true);

      try {
        const res = await apiFetch(`/api/sessions/${sessionId}/transcribe`, {
          method: "POST",
          headers: { "Content-Type": mimeType },
          body: audioBuffer,
        });

        if (!res.ok) {
          console.error("Scribe transcription failed:", res.status);
          return null;
        }

        const data = await res.json();
        return {
          transcript: data.transcript,
          language: data.language_code || "en",
        };
      } catch (error) {
        console.error("Scribe transcription error:", error);
        return null;
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [sessionId]
  );

  return {
    isProcessing,
    transcribe,
  };
}
