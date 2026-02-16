import { useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/utils";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyDetails, setEmergencyDetails] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const getGreeting = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (data.content) {
        addMessage("assistant", data.content);
      }
      if (data.isEmergency) {
        setIsEmergency(true);
      }
    } catch (error) {
      console.error("Greeting error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, addMessage]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      addMessage("user", content);
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: content }),
          signal: controller.signal,
        });

        if (!res.body) {
          throw new Error("No response body");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        let assistantMsgId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "text") {
                  assistantContent += data.content;
                  if (!assistantMsgId) {
                    const msg = addMessage("assistant", assistantContent);
                    assistantMsgId = msg.id;
                  } else {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, content: assistantContent }
                          : m
                      )
                    );
                  }
                } else if (data.type === "done") {
                  if (data.isEmergency) {
                    setIsEmergency(true);
                    setEmergencyDetails(data.emergencyDetails);
                  }
                } else if (data.type === "error") {
                  console.error("Chat stream error:", data.content);
                }
              } catch {
                // Skip unparseable lines
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Send message error:", error);
          addMessage("assistant", "I'm sorry, I encountered an error. Please try again.");
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [sessionId, isLoading, addMessage]
  );

  const endSession = useCallback(async () => {
    try {
      await apiFetch(`/api/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          ended_at: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("End session error:", error);
    }
  }, [sessionId]);

  return {
    messages,
    isLoading,
    isEmergency,
    emergencyDetails,
    sendMessage,
    getGreeting,
    endSession,
    setMessages,
  };
}
