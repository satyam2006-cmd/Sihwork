import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession } from "@mcp/tools/index";
import { speechToText } from "@second-opinion/shared";

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

    const mimeType = request.headers.get("content-type") || "audio/webm";
    const arrayBuffer = await request.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const result = await speechToText(audioBuffer, mimeType);

    return NextResponse.json({
      transcript: result.transcript,
      language_code: result.language_code,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Transcribe error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
