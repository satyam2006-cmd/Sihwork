import { config } from "dotenv";
config({ path: ".env.local" });

import { createServiceClient } from "@second-opinion/shared";

const EMAIL = "doctor@demo.secondopinion.ai";
const PASSWORD = "doctor123456";

async function main() {
  const supabase = createServiceClient();

  // Check if doctor already exists
  const { data: existing } = await supabase
    .from("doctors")
    .select("id, full_name")
    .eq("full_name", "Dr. Demo Physician")
    .maybeSingle();

  if (existing) {
    console.log(`Demo doctor already exists (id: ${existing.id}). Skipping.`);
    return;
  }

  // Create auth user
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });

  if (authError) {
    // If user already exists in auth but not in doctors table, look them up
    if (authError.message.includes("already been registered")) {
      const { data: { users }, error: listError } =
        await supabase.auth.admin.listUsers();
      if (listError) throw listError;
      const user = users.find((u) => u.email === EMAIL);
      if (!user) throw new Error("User exists in auth but could not find them");

      const { error: insertError } = await supabase.from("doctors").insert({
        user_id: user.id,
        full_name: "Dr. Demo Physician",
        specialization: "General Medicine",
      });
      if (insertError) throw insertError;
      console.log("Demo doctor record created (auth user already existed).");
      console.log(`  Email:    ${EMAIL}`);
      console.log(`  Password: ${PASSWORD}`);
      return;
    }
    throw authError;
  }

  // Insert doctor record
  const { error: insertError } = await supabase.from("doctors").insert({
    user_id: authData.user.id,
    full_name: "Dr. Demo Physician",
    specialization: "General Medicine",
  });

  if (insertError) throw insertError;

  console.log("Demo doctor created successfully!");
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
}

main().catch((err) => {
  console.error("Failed to seed demo doctor:", err);
  process.exit(1);
});
