import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession, updateSession } from "@mcp/tools/index";

// Get session details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const result = await getSession({
      session_id: id,
      verify_owner_user_id: user.id,
      include_visit_record: true,
      include_summary: true,
    });

    return NextResponse.json({
      session: result.session,
      visit_record: result.visit_record,
      summary: result.summary,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Session detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Update session
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    // Verify ownership
    await getSession({
      session_id: id,
      verify_owner_user_id: user.id,
    });

    const body = await request.json();
    await updateSession({ session_id: id, ...body });

    // Return updated session
    const result = await getSession({
      session_id: id,
      include_visit_record: true,
      include_summary: true,
    });

    return NextResponse.json({ session: result.session });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Session update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
