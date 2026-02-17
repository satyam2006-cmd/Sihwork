import { useEffect, useRef, useState, useCallback } from "react";
import { getAccessTokenFromCookie } from "@/lib/supabase";

type ConnectionState = "disconnected" | "connecting" | "connected" | "error" | "timeout";

interface WSMessage {
  type: string;
  text?: string;
  role?: string;
  language?: string;
  data?: { status?: string; message?: string };
}

export function useScribeWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 2;

  const connect = useCallback(async () => {
    if (!sessionId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setConnectionState("connecting");

    try {
      const accessToken = getAccessTokenFromCookie();
      if (!accessToken) {
        setConnectionState("error");
        return;
      }

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
      const url = `${wsUrl}?token=${accessToken}&sessionId=${sessionId}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      connectTimeoutRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          wsRef.current = null;
          setConnectionState("timeout");
        }
      }, 10000);

      ws.onopen = () => {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        retryCountRef.current = 0;
        setConnectionState("connected");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          setLastMessage(message);
        } catch {
          console.error("Failed to parse WS message");
        }
      };

      ws.onclose = (event) => {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        wsRef.current = null;

        if (event.code === 1000) {
          setConnectionState("disconnected");
        } else if (event.code === 1008) {
          setConnectionState("error");
        } else {
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            setConnectionState("connecting");
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, 3000);
          } else {
            setConnectionState("timeout");
          }
        }
      };

      ws.onerror = () => {
        // onerror is always followed by onclose
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      setConnectionState("error");
    }
  }, [sessionId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }
    retryCountRef.current = 0;
    setConnectionState("disconnected");
  }, []);

  const sendAudio = useCallback((audioBuffer: ArrayBuffer, mimeType?: string): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (mimeType) {
        wsRef.current.send(JSON.stringify({ type: "audio_meta", mimeType }));
      }
      wsRef.current.send(audioBuffer);
      return true;
    }
    return false;
  }, []);

  const sendControl = useCallback((type: string, data?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionState,
    lastMessage,
    connect,
    disconnect,
    sendAudio,
    sendControl,
  };
}
