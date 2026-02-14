"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat, type Message } from "@/hooks/use-chat";
import { MessageBubble } from "./message-bubble";
import { EmergencyAlert } from "./emergency-alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface ChatInterfaceProps {
  sessionId: string;
  mode: "text" | "voice";
  existingMessages?: Array<{ role: string; content: string; timestamp: string }>;
}

export function ChatInterface({ sessionId, mode, existingMessages }: ChatInterfaceProps) {
  const {
    messages,
    isLoading,
    isEmergency,
    emergencyDetails,
    sendMessage,
    getGreeting,
    endSession,
    setMessages,
  } = useChat(sessionId);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    if (existingMessages && existingMessages.length > 0) {
      // Restore existing messages
      const restored: Message[] = existingMessages.map((m, i) => ({
        id: `restored-${i}`,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.timestamp,
      }));
      setMessages(restored);
    } else {
      // Get initial greeting
      getGreeting();
    }
  }, [initialized, existingMessages, getGreeting, setMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleEndSession = async () => {
    await endSession();
    toast.success("Session ended. Processing your consultation...");

    // Trigger post-session pipeline
    try {
      await fetch(`/api/session/${sessionId}/complete`, {
        method: "POST",
      });
    } catch {
      // Pipeline runs async, don't block
    }

    router.push(`/dashboard/session/${sessionId}`);
    router.refresh();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">
            {mode === "voice" ? "Voice" : "Text"} Consultation
          </h2>
          <p className="text-sm text-gray-500">
            Session with Dr. AI
          </p>
        </div>
        <Button variant="outline" onClick={handleEndSession}>
          End Session
        </Button>
      </div>

      {/* Emergency alert */}
      {isEmergency && <EmergencyAlert details={emergencyDetails} />}

      {/* Messages */}
      <Card className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-2 text-sm">
                <div className="flex items-center gap-1">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </Card>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          className="min-h-[44px] max-h-32 resize-none"
          rows={1}
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
