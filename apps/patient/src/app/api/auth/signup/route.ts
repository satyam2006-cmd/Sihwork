import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@second-opinion/shared";

/**
 * Server-side patient record creation after signup.
 * Uses the service client (bypasses RLS) because the user may not
 * have an active session yet (e.g. if email confirmation is enabled).
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, fullName } = await request.json();

    if (!userId || !fullName) {
      return NextResponse.json(
        { error: "userId and fullName are required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Verify the user actually exists in auth.users
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid user" },
        { status: 400 }
      );
    }

    // Create patient record (upsert to handle race conditions)
    const { error: patientError } = await supabase
      .from("patients")
      .upsert(
        { user_id: userId, full_name: fullName },
        { onConflict: "user_id" }
      );

    if (patientError) {
      console.error("Failed to create patient record:", patientError);
      return NextResponse.json(
        { error: "Failed to create patient profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Signup API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
