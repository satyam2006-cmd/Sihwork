import { NextResponse } from "next/server";
import { getPatient } from "@mcp/tools/index";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createServiceClient();

  // Fetch all patients
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, full_name, date_of_birth, gender, chronic_conditions")
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with session stats using tool
  const result = await Promise.all(
    (patients || []).map(async (p) => {
      try {
        const patientResult = await getPatient({
          patient_id: p.id,
          include_session_stats: true,
        });
        return {
          ...p,
          chronic_conditions: p.chronic_conditions || [],
          session_count: patientResult.session_stats?.session_count || 0,
          last_session_at: patientResult.session_stats?.last_session_at || null,
        };
      } catch {
        return {
          ...p,
          chronic_conditions: p.chronic_conditions || [],
          session_count: 0,
          last_session_at: null,
        };
      }
    })
  );

  return NextResponse.json(result);
}
