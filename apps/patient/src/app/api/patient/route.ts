import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPatient, updatePatient } from "@mcp/tools/index";

// Update patient profile
export async function PATCH(request: NextRequest) {
  try {
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const body = await request.json();

    // Get patient by user_id
    const { patient } = await getPatient({ user_id: user.id });

    await updatePatient({
      patient_id: patient.id as string,
      ...body,
    });

    // Return updated patient
    const { patient: updated } = await getPatient({ user_id: user.id });
    return NextResponse.json({ patient: updated });
  } catch (error) {
    console.error("Patient update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
