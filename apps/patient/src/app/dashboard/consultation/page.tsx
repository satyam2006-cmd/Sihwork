"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ConsultationPage() {
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  const startSession = async (mode: "text" | "voice") => {
    setStarting(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to start session");
        return;
      }

      router.push(`/dashboard/session/${data.session.id}`);
    } catch {
      toast.error("Failed to start session");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Start Consultation</h2>
        <p className="text-gray-500">
          Get a second opinion from our AI doctor
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="text-4xl mb-2">💬</div>
            <CardTitle>Text Consultation</CardTitle>
            <CardDescription>
              Chat with the AI doctor via text. Your medical history and documents
              will be reviewed automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => startSession("text")}
              disabled={starting}
            >
              {starting ? "Starting..." : "Start Text Chat"}
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="text-4xl mb-2">🎤</div>
            <CardTitle>Voice Consultation</CardTitle>
            <CardDescription>
              Speak with the AI doctor. Supports English and Hindi.
              Uses push-to-talk for clear communication.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => startSession("voice")}
              disabled={starting}
            >
              {starting ? "Starting..." : "Start Voice Call"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium mb-2">Before you begin</h3>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Upload any recent medical documents for a more informed consultation</li>
            <li>The AI doctor will review your medical history automatically</li>
            <li>This is a second opinion tool — always consult your primary physician</li>
            <li>In case of emergency, call your local emergency number immediately</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
