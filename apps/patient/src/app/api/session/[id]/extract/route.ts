import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession } from "@mcp/tools/index";
import { extractVisitData } from "@second-opinion/shared";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const { session } = await getSession({
      session_id: sessionId,
      verify_owner_user_id: user.id,
    });

    const transcript = (session.transcript as unknown[]) || [];
    const extraction = await extractVisitData(transcript as Parameters<typeof extractVisitData>[0]);
    return NextResponse.json({ extraction });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Extraction error:", error);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
