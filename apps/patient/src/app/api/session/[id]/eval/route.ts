import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession } from "@mcp/tools/index";
import { evaluateConversation } from "@second-opinion/shared";

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

    const transcript = (session.transcript as Parameters<typeof evaluateConversation>[0]) || [];
    const eval_result = await evaluateConversation(transcript);
    return NextResponse.json({ eval: eval_result });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Eval error:", error);
    return NextResponse.json({ error: "Evaluation failed" }, { status: 500 });
  }
}
