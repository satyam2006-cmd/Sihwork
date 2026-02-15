/**
 * Seed a demo patient account with realistic EHR data.
 *
 * Usage: npx tsx tests/seed-demo-patient.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // also load .env for ANTHROPIC_API_KEY etc.
import { createServiceClient } from '@second-opinion/shared';

const DEMO_EMAIL = 'demo@secondopinion.ai';
const DEMO_PASSWORD = 'demo1234';

async function main() {
  const supabase = createServiceClient();

  // 1. Create auth user (or find existing)
  console.log('Creating demo auth user...');
  let userId: string;

  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(u => u.email === DEMO_EMAIL);

  if (existing) {
    console.log(`  User already exists: ${existing.id}`);
    userId = existing.id;
  } else {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true, // auto-confirm so they can login immediately
    });
    if (error) throw new Error(`Failed to create user: ${error.message}`);
    userId = newUser.user.id;
    console.log(`  Created user: ${userId}`);
  }

  // 2. Upsert patient record — realistic "moderate complexity" patient
  console.log('Upserting patient record...');
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .upsert({
      user_id: userId,
      full_name: 'Priya Sharma',
      date_of_birth: '1988-07-22',
      gender: 'Female',
      blood_type: 'B+',
      allergies: JSON.stringify(['Penicillin', 'Sulfa drugs']),
      chronic_conditions: JSON.stringify([
        'Type 2 Diabetes',
        'Hypothyroidism',
        'PCOS',
        'Mild anxiety',
      ]),
      current_medications: JSON.stringify([
        'Metformin 500mg twice daily',
        'Levothyroxine 50mcg daily',
        'Vitamin D3 60,000 IU weekly',
      ]),
      emergency_contact: JSON.stringify({
        name: 'Rajesh Sharma',
        relationship: 'Spouse',
        phone: '+91 98765 43210',
      }),
    }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (patientError) throw new Error(`Failed to upsert patient: ${patientError.message}`);
  const patientId = patient.id;
  console.log(`  Patient ID: ${patientId}`);

  // 3. Clear existing documents for this patient (idempotent re-runs)
  await supabase.from('documents').delete().eq('patient_id', patientId);

  // 4. Seed medical documents
  console.log('Seeding medical documents...');
  const documents = [
    {
      file_name: 'CBC-Report-Jan2026.pdf',
      file_path: 'demo/CBC-Report-Jan2026.pdf',
      file_size: 45000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'Hemoglobin', value: '11.8 g/dL', reference: '12.0-15.5 g/dL', flag: 'low' },
          { name: 'WBC', value: '6,800/μL', reference: '4,500-11,000/μL' },
          { name: 'Platelets', value: '245,000/μL', reference: '150,000-400,000/μL' },
          { name: 'HbA1c', value: '7.2%', reference: '4.0-5.6%', flag: 'high' },
          { name: 'Fasting Glucose', value: '142 mg/dL', reference: '70-100 mg/dL', flag: 'high' },
        ],
      },
      extracted_summary: 'CBC shows mildly low hemoglobin (11.8). HbA1c elevated at 7.2% indicating suboptimal diabetes control. Fasting glucose 142 mg/dL. WBC and platelets normal.',
      uploaded_at: '2026-01-10T10:00:00Z',
    },
    {
      file_name: 'Thyroid-Panel-Dec2025.pdf',
      file_path: 'demo/Thyroid-Panel-Dec2025.pdf',
      file_size: 32000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'TSH', value: '5.8 mIU/L', reference: '0.4-4.0 mIU/L', flag: 'high' },
          { name: 'Free T4', value: '0.9 ng/dL', reference: '0.8-1.8 ng/dL' },
          { name: 'Free T3', value: '2.4 pg/mL', reference: '2.3-4.2 pg/mL' },
        ],
      },
      extracted_summary: 'TSH mildly elevated at 5.8 suggesting current levothyroxine dose may need adjustment. Free T4 and T3 at lower end of normal range.',
      uploaded_at: '2025-12-05T10:00:00Z',
    },
    {
      file_name: 'Pelvic-Ultrasound-Nov2025.pdf',
      file_path: 'demo/Pelvic-Ultrasound-Nov2025.pdf',
      file_size: 128000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'imaging',
        findings: 'Bilateral ovaries show multiple peripheral follicles (right: 14 follicles, left: 12 follicles). Uterus normal in size. No adnexal masses or free fluid.',
        impression: 'Findings consistent with polycystic ovarian morphology. No other significant abnormality.',
      },
      extracted_summary: 'Pelvic ultrasound showing polycystic ovarian morphology bilaterally. Uterus normal. No masses or free fluid detected.',
      uploaded_at: '2025-11-20T10:00:00Z',
    },
    {
      file_name: 'Lipid-Panel-Oct2025.pdf',
      file_path: 'demo/Lipid-Panel-Oct2025.pdf',
      file_size: 28000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'Total Cholesterol', value: '218 mg/dL', reference: '<200 mg/dL', flag: 'high' },
          { name: 'LDL', value: '138 mg/dL', reference: '<100 mg/dL', flag: 'high' },
          { name: 'HDL', value: '42 mg/dL', reference: '>50 mg/dL', flag: 'low' },
          { name: 'Triglycerides', value: '190 mg/dL', reference: '<150 mg/dL', flag: 'high' },
        ],
      },
      extracted_summary: 'Dyslipidemia: elevated total cholesterol (218), LDL (138), triglycerides (190), and low HDL (42). Pattern consistent with insulin resistance / metabolic syndrome.',
      uploaded_at: '2025-10-08T10:00:00Z',
    },
    {
      file_name: 'Vitamin-D-Report-Sep2025.pdf',
      file_path: 'demo/Vitamin-D-Report-Sep2025.pdf',
      file_size: 18000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'Vitamin D (25-OH)', value: '18 ng/mL', reference: '30-100 ng/mL', flag: 'low' },
          { name: 'Calcium', value: '9.2 mg/dL', reference: '8.5-10.5 mg/dL' },
        ],
      },
      extracted_summary: 'Vitamin D deficiency at 18 ng/mL (target >30). Calcium within normal limits. Patient on weekly supplementation.',
      uploaded_at: '2025-09-15T10:00:00Z',
    },
  ];

  for (const doc of documents) {
    const { error } = await supabase.from('documents').insert({
      patient_id: patientId,
      ...doc,
    });
    if (error) console.error(`  Failed to insert ${doc.file_name}: ${error.message}`);
    else console.log(`  Added: ${doc.file_name}`);
  }

  // 5. Seed a prior completed session with summary
  console.log('Seeding prior session...');

  // Clean up existing demo sessions
  const { data: existingSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('patient_id', patientId)
    .eq('status', 'completed');

  if (existingSessions && existingSessions.length > 0) {
    for (const s of existingSessions) {
      await supabase.from('session_summaries').delete().eq('session_id', s.id);
      await supabase.from('visit_records').delete().eq('session_id', s.id);
    }
    await supabase.from('sessions').delete().eq('patient_id', patientId).eq('status', 'completed');
  }

  const { data: priorSession, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      patient_id: patientId,
      status: 'completed',
      mode: 'text',
      language: 'en',
      transcript: [
        { id: 'msg-0', role: 'assistant', content: 'Hello Priya! I can see from your records that you have Type 2 Diabetes, Hypothyroidism, and PCOS. How can I help you today?', timestamp: '2026-01-15T10:00:00Z' },
        { id: 'msg-1', role: 'user', content: 'Hi doctor, I have been feeling very tired lately and gaining weight despite being on medication. My periods are also irregular again.', timestamp: '2026-01-15T10:01:00Z' },
        { id: 'msg-2', role: 'assistant', content: 'I understand that must be frustrating. The fatigue and weight gain could be related to your thyroid levels — I see your recent TSH was 5.8, which is above normal. How long have you been experiencing the tiredness?', timestamp: '2026-01-15T10:02:00Z' },
        { id: 'msg-3', role: 'user', content: 'About 3-4 weeks now. I also feel cold all the time and my skin has been really dry.', timestamp: '2026-01-15T10:03:00Z' },
        { id: 'msg-4', role: 'assistant', content: 'Those symptoms — fatigue, weight gain, cold intolerance, dry skin — along with your elevated TSH are all consistent with your hypothyroidism not being well-controlled at the current dose. Your levothyroxine may need to be increased. I would suggest discussing a dose adjustment with your endocrinologist.', timestamp: '2026-01-15T10:04:00Z' },
        { id: 'msg-5', role: 'user', content: 'That makes sense. What about my diabetes? My last HbA1c was 7.2%.', timestamp: '2026-01-15T10:05:00Z' },
        { id: 'msg-6', role: 'assistant', content: 'Your HbA1c at 7.2% means your average blood sugar control over the past 3 months is slightly above the target of below 7%. The good news is it is not critically high, but there is room for improvement. Are you taking your Metformin regularly and following any dietary plan?', timestamp: '2026-01-15T10:06:00Z' },
        { id: 'msg-7', role: 'user', content: 'I take Metformin regularly but I have not been great with diet honestly. I have been stress eating a lot.', timestamp: '2026-01-15T10:07:00Z' },
        { id: 'msg-8', role: 'assistant', content: 'That is very common and nothing to feel bad about. Stress management is actually a key part of managing PCOS, diabetes, and thyroid conditions together. I would recommend speaking with a nutritionist who understands metabolic syndrome, and your lipid panel also shows elevated cholesterol and triglycerides which would benefit from dietary changes. This is something to discuss with your doctor as a possibility.', timestamp: '2026-01-15T10:08:00Z' },
      ],
      started_at: '2026-01-15T10:00:00Z',
      ended_at: '2026-01-15T10:10:00Z',
    })
    .select('id')
    .single();

  if (sessionError) throw new Error(`Failed to create session: ${sessionError.message}`);
  console.log(`  Session ID: ${priorSession.id}`);

  // 6. Add session summary
  const { error: summaryError } = await supabase.from('session_summaries').insert({
    session_id: priorSession.id,
    patient_id: patientId,
    summary_text: 'Priya presented with fatigue, weight gain, cold intolerance, and dry skin lasting 3-4 weeks. These symptoms correlate with her elevated TSH (5.8) suggesting suboptimal thyroid control on current levothyroxine 50mcg. HbA1c at 7.2% indicates slightly above-target diabetes control, exacerbated by stress-related dietary changes. Lipid panel shows dyslipidemia consistent with metabolic syndrome. PCOS with irregular periods also contributing to overall symptom burden.',
    key_findings: [
      'Hypothyroidism under-treated — TSH 5.8, needs levothyroxine dose increase',
      'HbA1c 7.2% — slightly above target, diet compliance is main issue',
      'Dyslipidemia — elevated LDL, triglycerides, low HDL',
      'PCOS — irregular periods recurring',
      'Vitamin D deficiency — 18 ng/mL on supplementation',
    ],
    follow_up_items: [
      'Endocrinologist review for levothyroxine dose adjustment',
      'Nutritionist referral for metabolic syndrome diet plan',
      'Recheck TSH in 6-8 weeks after dose adjustment',
      'Consider adding statin if lifestyle changes insufficient for lipids',
      'Recheck Vitamin D in 3 months',
    ],
  });

  if (summaryError) console.error(`  Summary error: ${summaryError.message}`);
  else console.log('  Session summary added');

  // 7. Add visit record
  const { error: visitError } = await supabase.from('visit_records').insert({
    session_id: priorSession.id,
    patient_id: patientId,
    chief_complaint: 'Fatigue, weight gain, and irregular periods',
    symptoms: [
      { name: 'Fatigue', severity: 'moderate', duration: '3-4 weeks' },
      { name: 'Weight gain', severity: 'moderate', duration: '3-4 weeks' },
      { name: 'Cold intolerance', severity: 'mild', duration: '3-4 weeks' },
      { name: 'Dry skin', severity: 'mild', duration: '3-4 weeks' },
      { name: 'Irregular periods', severity: 'moderate', duration: 'Recurring' },
    ],
    assessment: 'Symptoms consistent with under-treated hypothyroidism (TSH 5.8) in the context of PCOS and Type 2 Diabetes. Metabolic syndrome with dyslipidemia. Stress-related dietary non-compliance contributing to suboptimal glycemic control.',
    diagnoses: [
      { condition: 'Hypothyroidism — suboptimally controlled', confidence: 'confirmed' },
      { condition: 'Type 2 Diabetes — above target', confidence: 'confirmed' },
      { condition: 'Dyslipidemia / Metabolic syndrome', confidence: 'probable' },
      { condition: 'PCOS with menstrual irregularity', confidence: 'confirmed' },
    ],
    recommendations: [
      { type: 'medication', description: 'Discuss levothyroxine dose increase with endocrinologist', urgency: 'soon' },
      { type: 'referral', description: 'Nutritionist for metabolic syndrome diet planning', urgency: 'routine' },
      { type: 'test', description: 'Recheck TSH in 6-8 weeks', urgency: 'routine' },
      { type: 'test', description: 'Recheck Vitamin D in 3 months', urgency: 'routine' },
      { type: 'lifestyle', description: 'Stress management — consider mindfulness or counseling', urgency: 'routine' },
    ],
    follow_up: 'Review TSH in 6-8 weeks after dose adjustment. Follow up on lipid panel in 3 months. Nutritionist appointment within 2 weeks.',
    red_flags: [],
    medication_changes: [],
    confidence_score: 0.85,
    needs_review: false,
  });

  if (visitError) console.error(`  Visit record error: ${visitError.message}`);
  else console.log('  Visit record added');

  console.log('\n========================================');
  console.log('Demo account ready!');
  console.log('========================================');
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log(`Patient:  Priya Sharma`);
  console.log(`History:  Type 2 Diabetes, Hypothyroidism, PCOS, Anxiety`);
  console.log(`Docs:     5 medical reports (labs, ultrasound)`);
  console.log(`Sessions: 1 prior consultation with summary`);
  console.log('========================================\n');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
