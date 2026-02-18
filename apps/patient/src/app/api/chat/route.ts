import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession, updateSession } from "@mcp/tools/index";
import { ConversationEngine, hydrateEHRContext, EmergencyScanner } from "@second-opinion/shared";
import type { ChatMessage } from "@second-opinion/shared";

// Stateless emergency scanner — shared across all requests
const emergencyScanner = new EmergencyScanner();

export async function POST(request: NextRequest) {
  try {
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const { sessionId, message } = await request.json();
    if (!sessionId) {
      return new Response("sessionId required", { status: 400 });
    }

    // Verify session ownership and load session data
    const { session } = await getSession({
      session_id: sessionId,
      verify_owner_user_id: user.id,
    });

    const patientId = session.patient_id as string;
    const transcript = (session.transcript as ChatMessage[]) || [];
    const metadata = (session.metadata as Record<string, unknown>) || {};

    // Rebuild engine from DB state each request
    const ehrContext = await hydrateEHRContext(patientId);
    const engine = ConversationEngine.fromTranscript(
      ehrContext,
      transcript,
      {
        isEmergency: (metadata.isEmergency as boolean) || false,
        emergencyDetails: (metadata.emergencyDetails as string) || null,
        sessionNotes: (metadata.sessionNotes as Record<string, unknown>) || {},
        conversationSummary: (metadata.conversationSummary as string) || null,
      },
      undefined,
      { useRouter: true },
    );

    // If no message, send greeting
    if (!message) {
      const greeting = await engine.getGreeting();

      // Save transcript + metadata to DB
      const updatedTranscript = engine.getTranscript();
      const updatedMetadata = engine.getMetadata();
      await updateSession({
        session_id: sessionId,
        transcript: updatedTranscript,
        metadata: {
          ...metadata,
          ...updatedMetadata,
        },
      });

      return new Response(
        JSON.stringify({
          content: greeting.content,
          isEmergency: greeting.isEmergency,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Stream response using SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Fire emergency scanner in parallel
          const currentTranscript = engine.getTranscript();
          const scannerPromise = emergencyScanner.scan([
            ...currentTranscript,
            { id: 'pending', role: 'user' as const, content: message, timestamp: new Date().toISOString() },
          ]);

          const generator = engine.sendMessageStreaming(message);

          for await (const chunk of generator) {
            if (chunk.type === "text") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", content: chunk.content })}\n\n`)
              );
            } else if (chunk.type === "done") {
              // Await scanner result and merge
              const scanResult = await scannerPromise;
              const isEmergency = chunk.isEmergency || scanResult.isEmergency;
              const emergencyDetails = scanResult.isEmergency && !chunk.isEmergency
                ? JSON.stringify({ source: 'emergency_scanner', ...scanResult })
                : chunk.emergencyDetails || null;

              // Save updated transcript + metadata to DB
              const updatedTranscript = engine.getTranscript();
              const updatedMetadata = engine.getMetadata();
              await updateSession({
                session_id: sessionId,
                transcript: updatedTranscript,
                emergency_flagged: isEmergency,
                emergency_details: emergencyDetails,
                metadata: {
                  ...metadata,
                  ...updatedMetadata,
                },
              });

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "done",
                    content: chunk.content,
                    isEmergency,
                    emergencyDetails,
                  })}\n\n`
                )
              );
            }
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: String(error) })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return new Response("Session not found", { status: 404 });
    }
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
