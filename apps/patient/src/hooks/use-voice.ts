import { useRef, useState, useCallback, useEffect } from "react";

// Preferred MIME types in order of priority
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
  // Fallback — let the browser pick
  return "";
}

// Safari / older iOS may expose webkitAudioContext instead of AudioContext
const AudioCtx =
  typeof window !== "undefined"
    ? window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    : undefined;

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playbackIdRef = useRef(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up AudioContext on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
      // Stop any in-flight playback
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      if (!AudioCtx) throw new Error("AudioContext not supported");
      audioContextRef.current = new AudioCtx();
    }
    return audioContextRef.current;
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    // Guard against double-start
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

      // Set up analyser for audio level visualization (reuse AudioContext)
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

      // Start level monitoring
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(average / 255);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Set up MediaRecorder with browser-compatible MIME type
      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      throw error;
    }
  }, [isRecording, getAudioContext]);

  const stopRecording = useCallback(async (): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        resolve(null);
        return;
      }

      const recordedMimeType = mediaRecorderRef.current.mimeType || getSupportedMimeType() || "audio/mp4";

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recordedMimeType });
        const arrayBuffer = await blob.arrayBuffer();
        resolve({ buffer: arrayBuffer, mimeType: recordedMimeType });
      };

      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Stop audio level monitoring
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setAudioLevel(0);

      // Disconnect analyser source node (but keep AudioContext alive for playback)
      sourceNodeRef.current?.disconnect();
      sourceNodeRef.current = null;

      // Stop media stream tracks (releases microphone)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    });
  }, []);

  const playAudio = useCallback(async (base64Audio: string): Promise<void> => {
    // Track playback ID so stale completions don't interfere
    const thisPlaybackId = ++playbackIdRef.current;

    // Stop any currently-playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    try {
      // Use HTML5 Audio element — works on iOS without requiring a user gesture
      // for each play() call (audio is unlocked after first user interaction).
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Sarvam TTS returns WAV audio; use generic type so browser auto-detects
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      if (playbackIdRef.current !== thisPlaybackId) {
        URL.revokeObjectURL(url);
        return;
      }

      const audio = new Audio(url);
      currentAudioRef.current = audio;

      return new Promise<void>((resolve) => {
        const cleanup = () => {
          URL.revokeObjectURL(url);
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null;
          }
        };

        audio.onended = () => { cleanup(); resolve(); };
        audio.onerror = () => { cleanup(); resolve(); };

        audio.play().catch(() => { cleanup(); resolve(); });
      });
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, []);

  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
    playAudio,
  };
}
