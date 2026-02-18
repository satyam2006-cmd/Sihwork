import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession } from "@mcp/tools/index";
import { textToSpeech } from "@second-opinion/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    // Verify session ownership
    await getSession({
      session_id: sessionId,
      verify_owner_user_id: user.id,
    });

    const { text, language } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const audioBuffer = await textToSpeech(text, language || "en-IN");
    const base64Audio = audioBuffer.toString("base64");

    return NextResponse.json({ audio: base64Audio });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Synthesize error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Synthesis failed" },
      { status: 500 }
    );
  }
}
