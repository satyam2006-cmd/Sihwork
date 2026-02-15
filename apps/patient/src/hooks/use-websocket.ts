import { useEffect, useRef, useState, useCallback } from "react";
import { getAccessTokenFromCookie } from "@/lib/supabase";
import type { WSMessage } from "@second-opinion/shared";

type ConnectionState = "disconnected" | "connecting" | "connected" | "error" | "timeout";

export function useWebSocket(sessionId: string | null) {
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

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
      const url = `${wsUrl}?token=${accessToken}&sessionId=${sessionId}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      // Connection timeout - if not connected within 10s, give up
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
          // Normal close (user disconnected or session ended gracefully)
          setConnectionState("disconnected");
        } else if (event.code === 1008) {
          // Policy violation — auth failed or session not found
          setConnectionState("error");
        } else {
          // Unexpected close — auto-reconnect with retry limit
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
        // onerror is always followed by onclose, so let onclose handle state
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

  const sendAudio = useCallback((audioBuffer: ArrayBuffer): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioBuffer);
      return true;
    }
    return false;
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text", text }));
    }
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
    sendText,
    sendControl,
  };
}
