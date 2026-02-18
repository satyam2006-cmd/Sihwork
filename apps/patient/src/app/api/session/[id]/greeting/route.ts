import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession, updateSession } from "@mcp/tools/index";
import { ConversationEngine, hydrateEHRContext, textToSpeech } from "@second-opinion/shared";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    // Verify session ownership and load session
    const { session } = await getSession({
      session_id: sessionId,
      verify_owner_user_id: user.id,
    });

    const patientId = session.patient_id as string;
    const language = (session.language as string) || "en";

    // Build engine and generate greeting
    const ehrContext = await hydrateEHRContext(patientId);
    const engine = new ConversationEngine(ehrContext, undefined, { useRouter: true });
    const greeting = await engine.getGreeting();

    // Generate TTS audio for greeting
    const languageCode = language === "en" ? "en-IN" : `${language}-IN`;
    let audio: string | null = null;
    try {
      const audioBuffer = await textToSpeech(greeting.content, languageCode);
      audio = audioBuffer.toString("base64");
    } catch (err) {
      console.error("Greeting TTS failed (will return text only):", err);
    }

    // Save initial transcript and metadata to DB
    const transcript = engine.getTranscript();
    const metadata = engine.getMetadata();
    await updateSession({
      session_id: sessionId,
      transcript,
      metadata,
    });

    return NextResponse.json({
      text: greeting.content,
      audio,
      language: languageCode,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Greeting error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Greeting failed" },
      { status: 500 }
    );
  }
}
