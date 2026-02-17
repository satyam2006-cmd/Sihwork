import { useRef, useState, useCallback, useEffect } from "react";

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function getSupportedMimeType(): string {
  for (const mimeType of MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "";
}

// Safari / older iOS may expose webkitAudioContext instead of AudioContext
const AudioCtx =
  typeof window !== "undefined"
    ? window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    : undefined;

interface UseScribeRecordingOptions {
  onAudioChunk: (buffer: ArrayBuffer, mimeType: string) => void;
  chunkIntervalMs?: number;
}

export function useScribeRecording({ onAudioChunk, chunkIntervalMs = 8000 }: UseScribeRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);
  const onAudioChunkRef = useRef(onAudioChunk);

  // Keep callback ref fresh without re-creating recorder
  useEffect(() => {
    onAudioChunkRef.current = onAudioChunk;
  }, [onAudioChunk]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
      }
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    };
  }, []);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      if (!AudioCtx) throw new Error("AudioContext not supported");
      audioContextRef.current = new AudioCtx();
    }
    return audioContextRef.current;
  }, []);

  const startContinuousRecording = useCallback(async (): Promise<void> => {
    if (isRecording || mediaRecorderRef.current?.state === "recording") {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // Audio level visualization
      const audioContext = getAudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      sourceNodeRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(average / 255);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      activeRef.current = true;

      // Create a fresh MediaRecorder and start it.
      // Instead of relying on timeslice (unsupported on Safari < 17),
      // we use manual stop/start cycling to produce complete, standalone
      // audio chunks that Sarvam ASR can decode independently.
      const createAndStart = () => {
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        const recordedMimeType = recorder.mimeType || mimeType || "audio/mp4";

        recorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            const buffer = await event.data.arrayBuffer();
            onAudioChunkRef.current(buffer, recordedMimeType);
          }
        };

        recorder.start();
      };

      createAndStart();

      // Periodically stop → emit chunk → restart to get complete audio files.
      // Each stop() produces a self-contained file with proper headers.
      chunkIntervalRef.current = setInterval(() => {
        const rec = mediaRecorderRef.current;
        if (rec && rec.state === "recording" && activeRef.current) {
          rec.stop();        // fires ondataavailable with complete file
          createAndStart();  // immediately start capturing again
        }
      }, chunkIntervalMs);

      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start continuous recording:", error);
      throw error;
    }
  }, [isRecording, getAudioContext, chunkIntervalMs]);

  const stopContinuousRecording = useCallback(() => {
    activeRef.current = false;

    // Stop the chunk cycling interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Stop the active recorder (fires final ondataavailable)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);

    // Stop audio level monitoring
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setAudioLevel(0);

    // Disconnect analyser
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    // Release mic
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  return {
    isRecording,
    audioLevel,
    startContinuousRecording,
    stopContinuousRecording,
  };
}
