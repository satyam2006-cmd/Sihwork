import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession } from "@mcp/tools/index";
import { speechToText } from "@second-opinion/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Load session to verify it exists and get current transcript
    const { session } = await getSession({ session_id: sessionId });

    const mimeType = request.headers.get("content-type") || "audio/webm";
    const arrayBuffer = await request.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const result = await speechToText(audioBuffer, mimeType);

    // Append to session transcript in DB
    const existingTranscript = (session.transcript as Array<{ id: string; role: string; content: string; timestamp: string }>) || [];
    const newEntry = {
      id: `scribe-${existingTranscript.length}`,
      role: "user" as const,
      content: result.transcript,
      timestamp: new Date().toISOString(),
      language: result.language_code,
    };

    await updateSession({
      session_id: sessionId,
      transcript: [...existingTranscript, newEntry],
    });

    return NextResponse.json({
      transcript: result.transcript,
      language_code: result.language_code,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Scribe transcribe error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
