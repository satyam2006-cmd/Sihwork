import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession, updateSession } from "@mcp/tools/index";
import { ConversationEngine, hydrateEHRContext, EmergencyScanner } from "@second-opinion/shared";

// In-memory conversation engines per session
const engines = new Map<string, ConversationEngine>();

// Stateless emergency scanner — shared across all sessions
const emergencyScanner = new EmergencyScanner();

// Periodic cleanup interval (every 5 minutes)
const STALE_ENGINE_MS = 60 * 60 * 1000; // 1 hour
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, engine] of engines) {
      if (now - engine.getCreatedAt() > STALE_ENGINE_MS) {
        engine.destroy();
        engines.delete(id);
      }
    }
    // Stop interval when no engines remain
    if (engines.size === 0 && cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }, 5 * 60 * 1000);
}

export async function POST(request: NextRequest) {
  try {
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const { sessionId, message } = await request.json();
    if (!sessionId) {
      return new Response("sessionId required", { status: 400 });
    }

    // Verify session ownership and get patient_id
    const { session } = await getSession({
      session_id: sessionId,
      verify_owner_user_id: user.id,
    });

    const patients = session.patients as unknown as { id: string } | null;
    const patientId = patients?.id || (session.patient_id as string);

    // Get or create conversation engine
    let engine = engines.get(sessionId);
    if (!engine) {
      const ehrContext = await hydrateEHRContext(patientId);
      engine = new ConversationEngine(ehrContext, undefined, { useRouter: true });
      engines.set(sessionId, engine);
      ensureCleanup();
    }

    // If no message, send greeting
    if (!message) {
      const greeting = await engine.getGreeting();

      // Update transcript in DB via tool
      const transcript = engine.getTranscript();
      await updateSession({ session_id: sessionId, transcript });

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
          // Fire emergency scanner in parallel (zero added latency — Haiku finishes before Sonnet stream)
          const currentTranscript = engine!.getTranscript();
          const scannerPromise = emergencyScanner.scan([
            ...currentTranscript,
            { id: 'pending', role: 'user' as const, content: message, timestamp: new Date().toISOString() },
          ]);

          const generator = engine!.sendMessageStreaming(message);

          for await (const chunk of generator) {
            if (chunk.type === "text") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", content: chunk.content })}\n\n`)
              );
            } else if (chunk.type === "done") {
              // Await scanner result and merge with main agent's emergency flag
              const scanResult = await scannerPromise;
              const isEmergency = chunk.isEmergency || scanResult.isEmergency;
              const emergencyDetails = scanResult.isEmergency && !chunk.isEmergency
                ? JSON.stringify({ source: 'emergency_scanner', ...scanResult })
                : chunk.emergencyDetails || null;

              // Update transcript via tool
              const transcript = engine!.getTranscript();
              await updateSession({
                session_id: sessionId,
                transcript,
                emergency_flagged: isEmergency,
                emergency_details: emergencyDetails,
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

/**
 * DELETE handler to clean up a session's engine when the session ends.
 * Called by the frontend when navigating away or ending a consultation.
 */
export async function DELETE(request: NextRequest) {
  try {
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const { sessionId } = await request.json();
    if (!sessionId) {
      return new Response("sessionId required", { status: 400 });
    }

    // Verify ownership before cleanup
    await getSession({
      session_id: sessionId,
      verify_owner_user_id: user.id,
    });

    const engine = engines.get(sessionId);
    if (engine) {
      engine.destroy();
      engines.delete(sessionId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
