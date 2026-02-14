import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPatient, createSession, listSessions } from "@mcp/tools/index";

// Create a new session
export async function POST(request: NextRequest) {
  try {
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const { patient } = await getPatient({ user_id: user.id });

    const body = await request.json().catch(() => ({}));
    const mode = body.mode || "text";
    const language = body.language || "en";

    const { session } = await createSession({
      patient_id: patient.id as string,
      mode,
      language,
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Session creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// List sessions
export async function GET() {
  try {
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const { patient } = await getPatient({ user_id: user.id });
    const { sessions } = await listSessions({ patient_id: patient.id as string });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Session list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
