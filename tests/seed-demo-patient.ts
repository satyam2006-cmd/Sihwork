/**
 * Seed a demo patient account using a Synthea "complex" patient profile.
 *
 * Usage: npx tsx tests/seed-demo-patient.ts
 *
 * Based on the complex-complexity profile from tests/utils/dataset-loader.ts:
 *   Type 2 Diabetes, Hypertension, COPD, CKD stage 3, Atrial fibrillation,
 *   Osteoarthritis — with 6 medications, 4 allergies, and 15 medical documents.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { createServiceClient } from '@second-opinion/shared';

const DEMO_EMAIL = 'demo@secondopinion.ai';
const DEMO_PASSWORD = 'demo1234';

async function main() {
  const supabase = createServiceClient();

  // ──────────────────────────────────────────────
  // 0. Delete existing demo patient (full cascade)
  // ──────────────────────────────────────────────
  console.log('Cleaning up existing demo patient...');

  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(u => u.email === DEMO_EMAIL);

  if (existing) {
    // Delete patient row first (cascades to documents, sessions, visit_records, session_summaries)
    const { data: existingPatient } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', existing.id)
      .single();

    if (existingPatient) {
      await supabase.from('documents').delete().eq('patient_id', existingPatient.id);
      // Sessions cascade to visit_records and session_summaries
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('patient_id', existingPatient.id);
      if (sessions) {
        for (const s of sessions) {
          await supabase.from('session_summaries').delete().eq('session_id', s.id);
          await supabase.from('visit_records').delete().eq('session_id', s.id);
        }
        await supabase.from('sessions').delete().eq('patient_id', existingPatient.id);
      }
      await supabase.from('patients').delete().eq('id', existingPatient.id);
      console.log(`  Deleted patient ${existingPatient.id} and all related records`);
    }

    // Delete the auth user
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(existing.id);
    if (deleteErr) console.error(`  Failed to delete auth user: ${deleteErr.message}`);
    else console.log(`  Deleted auth user ${existing.id}`);
  } else {
    console.log('  No existing demo user found');
  }

  // ──────────────────────────────────────────────
  // 1. Create new auth user
  // ──────────────────────────────────────────────
  console.log('Creating demo auth user...');
  const { data: newUser, error: userError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (userError) throw new Error(`Failed to create user: ${userError.message}`);
  const userId = newUser.user.id;
  console.log(`  Created user: ${userId}`);

  // ──────────────────────────────────────────────
  // 2. Create patient record (Synthea "complex" profile)
  // ──────────────────────────────────────────────
  console.log('Creating patient record...');
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert({
      user_id: userId,
      full_name: 'Ramesh Iyer',
      date_of_birth: '1958-04-12',
      gender: 'Male',
      blood_type: 'A+',
      allergies: JSON.stringify(['Penicillin', 'Sulfa drugs', 'Latex', 'Codeine']),
      chronic_conditions: JSON.stringify([
        'Type 2 Diabetes',
        'Hypertension',
        'COPD',
        'Chronic kidney disease stage 3',
        'Atrial fibrillation',
        'Osteoarthritis',
      ]),
      current_medications: JSON.stringify([
        'Metformin 1000mg twice daily',
        'Lisinopril 20mg daily',
        'Warfarin 5mg daily',
        'Tiotropium inhaler once daily',
        'Gabapentin 300mg three times daily',
        'Atorvastatin 40mg at bedtime',
      ]),
      emergency_contact: JSON.stringify({
        name: 'Sunita Iyer',
        relationship: 'Spouse',
        phone: '+91 98210 55678',
      }),
    })
    .select('id')
    .single();

  if (patientError) throw new Error(`Failed to create patient: ${patientError.message}`);
  const patientId = patient.id;
  console.log(`  Patient ID: ${patientId}`);

  // ──────────────────────────────────────────────
  // 3. Seed medical documents (Synthea-style mix)
  // ──────────────────────────────────────────────
  console.log('Seeding medical documents...');

  const documents = [
    // --- Lab results ---
    {
      file_name: 'HbA1c-Renal-Panel-Jan2026.pdf',
      file_path: 'demo/HbA1c-Renal-Panel-Jan2026.pdf',
      file_size: 42000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'HbA1c', value: '7.8%', reference: '4.0-5.6%', flag: 'high' },
          { name: 'Fasting Glucose', value: '156 mg/dL', reference: '70-100 mg/dL', flag: 'high' },
          { name: 'Creatinine', value: '1.6 mg/dL', reference: '0.7-1.3 mg/dL', flag: 'high' },
          { name: 'eGFR', value: '48 mL/min', reference: '>60 mL/min', flag: 'low' },
          { name: 'BUN', value: '28 mg/dL', reference: '7-20 mg/dL', flag: 'high' },
          { name: 'Potassium', value: '4.8 mEq/L', reference: '3.5-5.0 mEq/L' },
        ],
      },
      extracted_summary: 'HbA1c elevated at 7.8% indicating poor diabetes control. Creatinine 1.6 and eGFR 48 consistent with CKD stage 3b (declining from 55 in Oct). BUN mildly elevated. Potassium at upper end of normal — monitor closely given CKD and ACE inhibitor use.',
      uploaded_at: '2026-01-20T10:00:00Z',
    },
    {
      file_name: 'CBC-Coagulation-Jan2026.pdf',
      file_path: 'demo/CBC-Coagulation-Jan2026.pdf',
      file_size: 38000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'Hemoglobin', value: '12.1 g/dL', reference: '13.5-17.5 g/dL', flag: 'low' },
          { name: 'WBC', value: '7,200/μL', reference: '4,500-11,000/μL' },
          { name: 'Platelets', value: '198,000/μL', reference: '150,000-400,000/μL' },
          { name: 'INR', value: '2.4', reference: '2.0-3.0 (therapeutic for AFib)' },
          { name: 'PT', value: '28.5 sec', reference: '11-13.5 sec' },
        ],
      },
      extracted_summary: 'Mild anemia (Hb 12.1) likely related to CKD. INR 2.4 within therapeutic range for atrial fibrillation. WBC and platelets normal.',
      uploaded_at: '2026-01-20T10:00:00Z',
    },
    {
      file_name: 'Lipid-Panel-Dec2025.pdf',
      file_path: 'demo/Lipid-Panel-Dec2025.pdf',
      file_size: 26000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'Total Cholesterol', value: '195 mg/dL', reference: '<200 mg/dL' },
          { name: 'LDL', value: '102 mg/dL', reference: '<100 mg/dL', flag: 'high' },
          { name: 'HDL', value: '38 mg/dL', reference: '>40 mg/dL', flag: 'low' },
          { name: 'Triglycerides', value: '275 mg/dL', reference: '<150 mg/dL', flag: 'high' },
        ],
      },
      extracted_summary: 'LDL near target on atorvastatin 40mg. HDL low at 38. Triglycerides markedly elevated at 275 — correlates with poor glycemic control. Consider fibrate addition if TG remain elevated after optimizing diabetes management.',
      uploaded_at: '2025-12-10T10:00:00Z',
    },
    {
      file_name: 'Renal-Panel-Oct2025.pdf',
      file_path: 'demo/Renal-Panel-Oct2025.pdf',
      file_size: 30000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'Creatinine', value: '1.4 mg/dL', reference: '0.7-1.3 mg/dL', flag: 'high' },
          { name: 'eGFR', value: '55 mL/min', reference: '>60 mL/min', flag: 'low' },
          { name: 'BUN', value: '24 mg/dL', reference: '7-20 mg/dL', flag: 'high' },
          { name: 'Urine Albumin/Creatinine Ratio', value: '85 mg/g', reference: '<30 mg/g', flag: 'high' },
        ],
      },
      extracted_summary: 'CKD stage 3a with eGFR 55. Microalbuminuria present (ACR 85) indicating diabetic nephropathy. Trend shows gradual decline from eGFR 62 six months prior.',
      uploaded_at: '2025-10-15T10:00:00Z',
    },
    // --- Imaging ---
    {
      file_name: 'Chest-Xray-Nov2025.pdf',
      file_path: 'demo/Chest-Xray-Nov2025.pdf',
      file_size: 145000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'imaging',
        findings: 'Hyperinflated lungs consistent with COPD. Flattened diaphragms bilaterally. No acute infiltrates or effusions. Heart size at upper limits of normal.',
        impression: 'Chronic hyperinflation consistent with known COPD. No acute cardiopulmonary process. Borderline cardiomegaly — correlate with echocardiogram.',
      },
      extracted_summary: 'Chest X-ray showing COPD changes with hyperinflation. No pneumonia or effusions. Borderline cardiomegaly noted — echo recommended for further evaluation.',
      uploaded_at: '2025-11-05T10:00:00Z',
    },
    {
      file_name: 'Echocardiogram-Nov2025.pdf',
      file_path: 'demo/Echocardiogram-Nov2025.pdf',
      file_size: 180000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'imaging',
        findings: 'Left ventricular ejection fraction 52% (low-normal). Mild left atrial enlargement. No significant valvular disease. Diastolic dysfunction grade I.',
        impression: 'Preserved systolic function with mild diastolic dysfunction and left atrial enlargement, consistent with hypertensive heart disease and atrial fibrillation.',
      },
      extracted_summary: 'Echo shows LVEF 52% (low-normal), mild LA enlargement, and grade I diastolic dysfunction. Findings consistent with hypertensive heart disease and AFib. No valvular pathology.',
      uploaded_at: '2025-11-08T10:00:00Z',
    },
    {
      file_name: 'Knee-Xray-Sep2025.pdf',
      file_path: 'demo/Knee-Xray-Sep2025.pdf',
      file_size: 120000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'imaging',
        findings: 'Bilateral knee X-rays show moderate joint space narrowing of the medial compartment. Osteophyte formation at tibial spines and femoral condyles. No fracture or effusion.',
        impression: 'Moderate bilateral medial compartment osteoarthritis, Kellgren-Lawrence grade III.',
      },
      extracted_summary: 'Bilateral knee osteoarthritis, Kellgren-Lawrence grade III. Moderate medial compartment narrowing with osteophytes. No fracture.',
      uploaded_at: '2025-09-20T10:00:00Z',
    },
    // --- Spirometry / pulmonary ---
    {
      file_name: 'Spirometry-Aug2025.pdf',
      file_path: 'demo/Spirometry-Aug2025.pdf',
      file_size: 55000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'FEV1', value: '1.8L (62% predicted)', reference: '>80% predicted', flag: 'low' },
          { name: 'FVC', value: '3.1L (78% predicted)', reference: '>80% predicted', flag: 'low' },
          { name: 'FEV1/FVC Ratio', value: '0.58', reference: '>0.70', flag: 'low' },
          { name: 'Post-bronchodilator FEV1', value: '1.9L (65% predicted)', reference: '>12% improvement' },
        ],
      },
      extracted_summary: 'Moderate obstructive pattern. FEV1 62% predicted, FEV1/FVC 0.58. Minimal bronchodilator response (5% improvement). Consistent with GOLD stage II COPD.',
      uploaded_at: '2025-08-12T10:00:00Z',
    },
    // --- Prescriptions ---
    {
      file_name: 'Prescription-Cardiology-Dec2025.pdf',
      file_path: 'demo/Prescription-Cardiology-Dec2025.pdf',
      file_size: 22000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'prescription',
        medications: [
          { name: 'Warfarin', dose: '5mg', frequency: 'once daily', notes: 'Target INR 2.0-3.0' },
          { name: 'Lisinopril', dose: '20mg', frequency: 'once daily', notes: 'Monitor potassium and creatinine' },
          { name: 'Atorvastatin', dose: '40mg', frequency: 'at bedtime' },
        ],
      },
      extracted_summary: 'Cardiology prescription: Warfarin 5mg (target INR 2-3), Lisinopril 20mg, Atorvastatin 40mg. INR monitoring every 4 weeks.',
      uploaded_at: '2025-12-15T10:00:00Z',
    },
    {
      file_name: 'Prescription-Pulmonology-Aug2025.pdf',
      file_path: 'demo/Prescription-Pulmonology-Aug2025.pdf',
      file_size: 20000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'prescription',
        medications: [
          { name: 'Tiotropium (Spiriva)', dose: '18mcg', frequency: 'inhale once daily' },
          { name: 'Salbutamol (Asthalin)', dose: '100mcg', frequency: 'as needed for rescue', notes: 'Max 8 puffs/day' },
        ],
      },
      extracted_summary: 'Pulmonology prescription: Tiotropium 18mcg daily maintenance, Salbutamol PRN rescue inhaler. Follow-up spirometry in 6 months.',
      uploaded_at: '2025-08-14T10:00:00Z',
    },
    // --- Discharge summary ---
    {
      file_name: 'Discharge-Summary-Jul2025.pdf',
      file_path: 'demo/Discharge-Summary-Jul2025.pdf',
      file_size: 95000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'discharge_summary',
        admission_reason: 'Acute exacerbation of COPD with new-onset atrial fibrillation',
        hospital_course: 'Patient admitted with worsening dyspnea, productive cough, and irregular heart rate. Found to be in atrial fibrillation with rapid ventricular response (HR 132). Treated with IV antibiotics (levofloxacin), nebulizers, systemic steroids, and rate control with diltiazem. Converted to normal sinus rhythm on day 2 but reverted to AFib. Started on warfarin for stroke prevention. Respiratory symptoms improved. Discharged on day 5 in stable condition with AFib rate-controlled.',
        discharge_medications: [
          'Warfarin 5mg daily (new)',
          'Prednisone taper: 40mg x 5 days, then 20mg x 5 days',
          'Levofloxacin 750mg daily x 3 more days',
          'Tiotropium 18mcg inhaler daily',
          'Salbutamol PRN',
          'Metformin 1000mg twice daily (held during admission, resume)',
          'Lisinopril 20mg daily',
          'Gabapentin 300mg TID',
          'Atorvastatin 40mg at bedtime',
        ],
      },
      extracted_summary: 'Hospitalized 5 days for COPD exacerbation with new-onset atrial fibrillation. Treated with antibiotics, steroids, and rate control. Started on warfarin for AFib. Discharged stable with outpatient cardiology and pulmonology follow-up.',
      uploaded_at: '2025-07-28T10:00:00Z',
    },
    // --- Older labs showing trend ---
    {
      file_name: 'HbA1c-Renal-Apr2025.pdf',
      file_path: 'demo/HbA1c-Renal-Apr2025.pdf',
      file_size: 35000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'HbA1c', value: '7.4%', reference: '4.0-5.6%', flag: 'high' },
          { name: 'Creatinine', value: '1.3 mg/dL', reference: '0.7-1.3 mg/dL' },
          { name: 'eGFR', value: '62 mL/min', reference: '>60 mL/min' },
        ],
      },
      extracted_summary: 'HbA1c 7.4% — slightly improved from prior 7.6%. Renal function borderline with eGFR 62, creatinine at upper normal. Represents baseline before subsequent decline.',
      uploaded_at: '2025-04-10T10:00:00Z',
    },
    {
      file_name: 'ECG-Jul2025.pdf',
      file_path: 'demo/ECG-Jul2025.pdf',
      file_size: 48000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'Rhythm', value: 'Atrial fibrillation', reference: 'Normal sinus rhythm', flag: 'abnormal' },
          { name: 'Ventricular rate', value: '78 bpm', reference: '60-100 bpm' },
          { name: 'QTc', value: '440 ms', reference: '<450 ms' },
        ],
      },
      extracted_summary: 'ECG showing atrial fibrillation with controlled ventricular rate at 78 bpm. No ST-T wave changes. QTc normal. Rate well-controlled on current medications.',
      uploaded_at: '2025-07-30T10:00:00Z',
    },
    {
      file_name: 'Urine-Report-Jun2025.pdf',
      file_path: 'demo/Urine-Report-Jun2025.pdf',
      file_size: 18000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'lab_results',
        tests: [
          { name: 'Urine Protein', value: 'Trace', reference: 'Negative', flag: 'abnormal' },
          { name: 'Urine Glucose', value: '2+', reference: 'Negative', flag: 'high' },
          { name: 'Urine Ketones', value: 'Negative', reference: 'Negative' },
          { name: 'Specific Gravity', value: '1.020', reference: '1.005-1.030' },
        ],
      },
      extracted_summary: 'Trace proteinuria and 2+ glycosuria reflecting hyperglycemia. No ketonuria. Early diabetic nephropathy changes consistent with elevated ACR.',
      uploaded_at: '2025-06-05T10:00:00Z',
    },
    {
      file_name: 'Pulmonary-Rehab-Summary-Oct2025.pdf',
      file_path: 'demo/Pulmonary-Rehab-Summary-Oct2025.pdf',
      file_size: 40000,
      mime_type: 'application/pdf',
      status: 'processed',
      extracted_data: {
        document_type: 'discharge_summary',
        admission_reason: 'Outpatient pulmonary rehabilitation program — 8-week completion summary',
        hospital_course: 'Patient completed 8-week pulmonary rehabilitation. 6-minute walk distance improved from 320m to 385m. Oxygen saturation maintained >92% during exercise. Breathing technique and inhaler use education provided. Patient reports improved exercise tolerance and reduced dyspnea on daily activities.',
        discharge_medications: [],
      },
      extracted_summary: 'Completed 8-week pulmonary rehab. 6-min walk improved 320m to 385m (+20%). Better exercise tolerance and dyspnea control. Continue home exercise program.',
      uploaded_at: '2025-10-25T10:00:00Z',
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

  // ──────────────────────────────────────────────
  // 4. Seed completed sessions with summaries
  // ──────────────────────────────────────────────
  console.log('Seeding sessions...');

  // --- Session 1: COPD exacerbation follow-up + diabetes worsening (Aug 2025) ---
  const { data: session1, error: s1Err } = await supabase
    .from('sessions')
    .insert({
      patient_id: patientId,
      status: 'completed',
      mode: 'voice',
      language: 'en',
      transcript: [
        { id: 's1-0', role: 'assistant', content: 'Hello Ramesh! I can see you were recently hospitalized for a COPD exacerbation and newly diagnosed atrial fibrillation. How have you been feeling since your discharge?', timestamp: '2025-08-18T09:00:00Z' },
        { id: 's1-1', role: 'user', content: 'I am doing better than in the hospital but still getting breathless when I climb stairs. The new heart medicine is also making me a bit dizzy sometimes.', timestamp: '2025-08-18T09:01:00Z' },
        { id: 's1-2', role: 'assistant', content: 'The breathlessness on stairs is expected while your lungs recover — it can take 4-6 weeks after an exacerbation. Your spirometry showed moderate COPD with FEV1 at 62% predicted, so some exertional limitation is baseline. Are you using your Tiotropium inhaler daily and the Salbutamol as rescue?', timestamp: '2025-08-18T09:02:00Z' },
        { id: 's1-3', role: 'user', content: 'Yes, I use the Spiriva every morning and the Asthalin maybe 2-3 times a day. The dizziness with the blood thinner worries me more. I almost fell yesterday.', timestamp: '2025-08-18T09:03:00Z' },
        { id: 's1-4', role: 'assistant', content: 'That is concerning. The dizziness could be from your blood pressure dropping — Lisinopril can sometimes cause this, especially combined with the new AFib medications. Your most recent INR was 2.4 which is within the therapeutic range, so the Warfarin dose seems appropriate. I would recommend checking your blood pressure at home sitting and standing. If there is a big drop when you stand up, that points to orthostatic hypotension.', timestamp: '2025-08-18T09:04:00Z' },
        { id: 's1-5', role: 'user', content: 'Okay I will check that. The other thing is my sugar seems higher after the hospital. I was on steroids there and my readings have not come back to normal.', timestamp: '2025-08-18T09:05:00Z' },
        { id: 's1-6', role: 'assistant', content: 'That is a very common issue. The steroid taper you received during hospitalization can raise blood glucose for several weeks, and sometimes it unmasks worsening diabetes. Your HbA1c was already 7.4% in April. I would suggest getting a repeat HbA1c in the next few weeks to see where things stand now. If the sugars remain elevated, your doctor may need to consider adjusting the Metformin dose or adding another diabetes medication.', timestamp: '2025-08-18T09:06:00Z' },
        { id: 's1-7', role: 'user', content: 'My morning fasting sugar has been around 160-170 lately. Before it was around 130-140. Should I be worried?', timestamp: '2025-08-18T09:07:00Z' },
        { id: 's1-8', role: 'assistant', content: 'A fasting glucose of 160-170 is above target and does need attention, but it is not an emergency. The steroid effect should wear off in 2-3 more weeks. If it stays above 150 fasting after that, definitely discuss with your doctor. Also, your kidney function is something to watch — your eGFR was 62 in April, and Metformin dosing needs to be adjusted if it drops below 45. Keep up with your renal panel checks.', timestamp: '2025-08-18T09:08:00Z' },
        { id: 's1-9', role: 'user', content: 'Understood. Thank you doctor. I will get the tests done and follow up.', timestamp: '2025-08-18T09:09:00Z' },
      ],
      started_at: '2025-08-18T09:00:00Z',
      ended_at: '2025-08-18T09:12:00Z',
    })
    .select('id')
    .single();

  if (s1Err) throw new Error(`Session 1 failed: ${s1Err.message}`);
  console.log(`  Session 1: ${session1.id}`);

  await supabase.from('session_summaries').insert({
    session_id: session1.id,
    patient_id: patientId,
    summary_text: 'Ramesh is recovering from COPD exacerbation and new-onset AFib (hospitalized July 2025). Persistent exertional dyspnea improving but not at baseline. Dizziness episodes possibly from orthostatic hypotension — needs home BP monitoring. Post-steroid hyperglycemia with fasting glucose 160-170 (previously 130-140). CKD progression to monitor closely given diabetes and ACE inhibitor use.',
    key_findings: [
      'COPD recovery ongoing — using inhalers appropriately, rescue inhaler 2-3x/day',
      'Dizziness concerning for orthostatic hypotension — check sitting/standing BP',
      'INR 2.4 therapeutic — Warfarin dose appropriate',
      'Post-steroid hyperglycemia — fasting glucose elevated to 160-170',
      'CKD stage 3a (eGFR 62 in April) — needs repeat monitoring',
    ],
    follow_up_items: [
      'Home blood pressure monitoring sitting and standing for 1 week',
      'Repeat HbA1c and renal panel in 4 weeks',
      'Pulmonary rehabilitation referral to improve exercise capacity',
      'INR check in 2 weeks',
      'Follow up if dizziness worsens or any falls occur',
    ],
  });

  await supabase.from('visit_records').insert({
    session_id: session1.id,
    patient_id: patientId,
    chief_complaint: 'Persistent breathlessness on exertion and dizziness after hospital discharge',
    symptoms: [
      { name: 'Exertional dyspnea', severity: 'moderate', duration: '3 weeks (since discharge)' },
      { name: 'Dizziness', severity: 'moderate', duration: '2 weeks' },
      { name: 'Elevated blood glucose', severity: 'moderate', duration: 'Since steroid course' },
    ],
    assessment: 'Post-COPD exacerbation recovery with expected residual dyspnea. Dizziness likely orthostatic hypotension from antihypertensive + new cardiac medications. Post-steroid hyperglycemia with fasting glucose 160-170, may indicate worsening diabetes. CKD stage 3a baseline with need for monitoring.',
    diagnoses: [
      { condition: 'COPD — recovering from acute exacerbation', confidence: 'confirmed' },
      { condition: 'Orthostatic hypotension — suspected', confidence: 'probable' },
      { condition: 'Type 2 Diabetes — worsening glycemic control', confidence: 'confirmed' },
      { condition: 'Atrial fibrillation — rate-controlled on warfarin', confidence: 'confirmed' },
    ],
    recommendations: [
      { type: 'test', description: 'Repeat HbA1c and renal panel in 4 weeks', urgency: 'soon' },
      { type: 'lifestyle', description: 'Home BP monitoring sitting/standing for 1 week', urgency: 'soon' },
      { type: 'referral', description: 'Pulmonary rehabilitation program', urgency: 'routine' },
      { type: 'test', description: 'INR check in 2 weeks', urgency: 'routine' },
    ],
    follow_up: 'Recheck labs in 4 weeks. Follow up immediately if falls or worsening dizziness.',
    red_flags: [
      { description: 'Near-fall episode from dizziness — assess fall risk', severity: 'moderate' },
    ],
    medication_changes: [],
    confidence_score: 0.82,
    needs_review: false,
  });

  // --- Session 2: Knee pain + medication concerns (Nov 2025) ---
  const { data: session2, error: s2Err } = await supabase
    .from('sessions')
    .insert({
      patient_id: patientId,
      status: 'completed',
      mode: 'text',
      language: 'en',
      transcript: [
        { id: 's2-0', role: 'assistant', content: 'Hello Ramesh! Good to see you again. What would you like to discuss today?', timestamp: '2025-11-12T14:00:00Z' },
        { id: 's2-1', role: 'user', content: 'My knee pain has been getting much worse over the past month. I cannot walk more than 10 minutes without stopping. The X-ray showed arthritis grade 3.', timestamp: '2025-11-12T14:01:00Z' },
        { id: 's2-2', role: 'assistant', content: 'I can see your recent knee X-ray showing Kellgren-Lawrence grade III osteoarthritis in both knees, which is moderate-to-severe. For your pain management, there is an important consideration — with your CKD and warfarin use, we need to be very careful about pain medications. Are you currently taking anything for the pain?', timestamp: '2025-11-12T14:02:00Z' },
        { id: 's2-3', role: 'user', content: 'I have been taking ibuprofen from the medical shop when it gets really bad. Maybe 2-3 times a week.', timestamp: '2025-11-12T14:03:00Z' },
        { id: 's2-4', role: 'assistant', content: 'I need to flag this as important — ibuprofen and other NSAIDs are risky for you for two reasons. First, they can worsen your kidney function, and your eGFR has already dropped from 62 to 55. Second, NSAIDs increase bleeding risk when combined with warfarin. I would strongly recommend stopping the ibuprofen and discussing alternatives with your doctor. Paracetamol (acetaminophen) is safer for you, and your Gabapentin 300mg should also help with pain.', timestamp: '2025-11-12T14:04:00Z' },
        { id: 's2-5', role: 'user', content: 'Oh I did not know that about ibuprofen. What about the Gabapentin — it makes me drowsy and I still have pain. Can the dose be increased?', timestamp: '2025-11-12T14:05:00Z' },
        { id: 's2-6', role: 'assistant', content: 'Gabapentin can be increased gradually, but drowsiness is a common side effect that may worsen with higher doses. Also, Gabapentin is cleared by the kidneys, so with your CKD the dose may need to be adjusted by your doctor. For the osteoarthritis specifically, physiotherapy and exercises to strengthen the muscles around the knee can help significantly. Have you tried any rehabilitation?', timestamp: '2025-11-12T14:06:00Z' },
        { id: 's2-7', role: 'user', content: 'I did the pulmonary rehab which was helpful for my breathing, but nothing specific for the knees. I will ask about physio. What about knee replacement eventually?', timestamp: '2025-11-12T14:07:00Z' },
        { id: 's2-8', role: 'assistant', content: 'Knee replacement could be an option in the future, but with your multiple conditions — COPD, AFib on warfarin, CKD, and diabetes — surgical risk needs careful assessment. For now, conservative management with physiotherapy, weight management, and appropriate pain relief is the recommended approach. If those fail to control symptoms adequately, a surgical evaluation would be the next step.', timestamp: '2025-11-12T14:08:00Z' },
      ],
      started_at: '2025-11-12T14:00:00Z',
      ended_at: '2025-11-12T14:12:00Z',
    })
    .select('id')
    .single();

  if (s2Err) throw new Error(`Session 2 failed: ${s2Err.message}`);
  console.log(`  Session 2: ${session2.id}`);

  await supabase.from('session_summaries').insert({
    session_id: session2.id,
    patient_id: patientId,
    summary_text: 'Ramesh presented with worsening bilateral knee pain limiting walking to 10 minutes. X-ray confirms KL grade III OA. Critically, patient has been self-medicating with ibuprofen 2-3x/week — contraindicated given CKD (eGFR 55) and warfarin use. Educated on NSAID risks. Gabapentin causing drowsiness but not providing adequate pain relief. Discussed conservative management, physiotherapy referral, and future surgical considerations given complex comorbidities.',
    key_findings: [
      'NSAID use (ibuprofen) contraindicated — CKD and warfarin interaction risk',
      'KL grade III bilateral knee OA — significant functional limitation',
      'Gabapentin side effects (drowsiness) limiting dose escalation',
      'Kidney function declining (eGFR 62 → 55) — may be partly NSAID-related',
      'Surgical risk assessment would be complex given COPD, AFib, CKD',
    ],
    follow_up_items: [
      'STOP ibuprofen immediately — switch to paracetamol as needed',
      'Physiotherapy referral for knee strengthening program',
      'Recheck renal function in 4 weeks after stopping NSAIDs',
      'Discuss Gabapentin dose optimization with doctor',
      'Orthopedic referral if conservative measures fail in 3 months',
    ],
  });

  await supabase.from('visit_records').insert({
    session_id: session2.id,
    patient_id: patientId,
    chief_complaint: 'Worsening bilateral knee pain and difficulty walking',
    symptoms: [
      { name: 'Bilateral knee pain', severity: 'severe', duration: '1 month worsening' },
      { name: 'Limited walking distance', severity: 'moderate', duration: '10 minutes max' },
      { name: 'Gabapentin drowsiness', severity: 'mild', duration: 'Ongoing' },
    ],
    assessment: 'Progressive bilateral knee osteoarthritis (KL grade III) with significant functional impairment. Unsafe self-medication with NSAIDs given CKD and anticoagulation. Possible contribution of ibuprofen to recent eGFR decline (62→55). Gabapentin providing suboptimal analgesia with limiting side effects.',
    diagnoses: [
      { condition: 'Bilateral knee osteoarthritis — KL grade III, worsening', confidence: 'confirmed' },
      { condition: 'NSAID-related nephrotoxicity risk — possible contributor to CKD decline', confidence: 'probable' },
      { condition: 'Drug interaction risk — ibuprofen + warfarin', confidence: 'confirmed' },
    ],
    recommendations: [
      { type: 'medication', description: 'Stop ibuprofen immediately, substitute paracetamol 500mg as needed', urgency: 'urgent' },
      { type: 'referral', description: 'Physiotherapy for knee strengthening and mobility', urgency: 'soon' },
      { type: 'test', description: 'Repeat renal panel in 4 weeks after stopping NSAIDs', urgency: 'soon' },
      { type: 'medication', description: 'Review Gabapentin dosing with nephrologist input', urgency: 'routine' },
    ],
    follow_up: 'Stop NSAIDs immediately. Recheck renal function in 4 weeks. Physiotherapy within 2 weeks. Ortho referral if no improvement in 3 months.',
    red_flags: [
      { description: 'NSAID use with CKD and warfarin — stop immediately', severity: 'high' },
    ],
    medication_changes: [
      { medication: 'Ibuprofen', change: 'STOP — contraindicated', reason: 'CKD + warfarin interaction' },
      { medication: 'Paracetamol 500mg', change: 'START as needed for knee pain', reason: 'Safer alternative' },
    ],
    confidence_score: 0.88,
    needs_review: false,
  });

  // --- Session 3: CKD progression concern + diabetes review (Jan 2026) ---
  const { data: session3, error: s3Err } = await supabase
    .from('sessions')
    .insert({
      patient_id: patientId,
      status: 'completed',
      mode: 'text',
      language: 'en',
      transcript: [
        { id: 's3-0', role: 'assistant', content: 'Hello Ramesh. I see you have some new lab results. How have you been doing?', timestamp: '2026-01-25T11:00:00Z' },
        { id: 's3-1', role: 'user', content: 'Not great doctor. My kidney report has got worse. The eGFR has dropped to 48 and the doctor said it is now stage 3b. I am worried about dialysis.', timestamp: '2026-01-25T11:01:00Z' },
        { id: 's3-2', role: 'assistant', content: 'I understand your worry. Your eGFR has gone from 62 in April, to 55 in October, and now 48 in January — that is a significant decline over 9 months. The good news is that stage 3b does not mean dialysis is imminent, but this rate of decline does need to be addressed aggressively. Did you stop the ibuprofen as we discussed last time?', timestamp: '2026-01-25T11:02:00Z' },
        { id: 's3-3', role: 'user', content: 'Yes I stopped it completely after our last consultation. I have been using only Paracetamol. But the creatinine is still going up.', timestamp: '2026-01-25T11:03:00Z' },
        { id: 's3-4', role: 'assistant', content: 'Good that you stopped the NSAIDs. The continued decline despite stopping ibuprofen suggests the primary driver is diabetic nephropathy — your urine albumin-creatinine ratio was 85 in October, and your HbA1c has been above target. Speaking of which, I see the new HbA1c is 7.8%, up from 7.4% in April. This is going in the wrong direction.', timestamp: '2026-01-25T11:04:00Z' },
        { id: 's3-5', role: 'user', content: 'Yes I know. After the steroids my sugar never fully came down. And honestly the diet has been hard to follow. My wife tries to cook low sugar meals but I end up eating rice and sweets at family gatherings.', timestamp: '2026-01-25T11:05:00Z' },
        { id: 's3-6', role: 'assistant', content: 'Diet changes are genuinely difficult, especially in social settings. But here is the important connection — your diabetes is now the main factor driving your kidney damage. Each point reduction in HbA1c significantly slows CKD progression. Your Metformin dose may need review too — at eGFR 48, the dose should likely be reduced from 1000mg to 500mg twice daily. Going below eGFR 30 means Metformin would need to stop entirely.', timestamp: '2026-01-25T11:06:00Z' },
        { id: 's3-7', role: 'user', content: 'That is scary. What else can be done for the kidneys?', timestamp: '2026-01-25T11:07:00Z' },
        { id: 's3-8', role: 'assistant', content: 'Several things are important right now. Your Lisinopril is already helping protect the kidneys. Blood pressure control is critical — keep it below 130/80. Your potassium at 4.8 is borderline high, so watch dietary potassium intake. And I would recommend asking your nephrologist about an SGLT2 inhibitor like dapagliflozin — these drugs have shown remarkable kidney protection in diabetic CKD, even independent of their blood sugar lowering effect. They can slow the decline significantly.', timestamp: '2026-01-25T11:08:00Z' },
        { id: 's3-9', role: 'user', content: 'I have heard of that medicine. I will bring this up with my nephrologist. Is there anything else I should be monitoring?', timestamp: '2026-01-25T11:09:00Z' },
        { id: 's3-10', role: 'assistant', content: 'Yes — with CKD stage 3b, you should also get your phosphorus and parathyroid hormone checked, as bone mineral metabolism can be affected. Your mild anemia (hemoglobin 12.1) is also likely CKD-related and should be tracked. And keep up the INR checks for your warfarin — kidney function changes can affect warfarin metabolism and require dose adjustments.', timestamp: '2026-01-25T11:10:00Z' },
      ],
      started_at: '2026-01-25T11:00:00Z',
      ended_at: '2026-01-25T11:15:00Z',
    })
    .select('id')
    .single();

  if (s3Err) throw new Error(`Session 3 failed: ${s3Err.message}`);
  console.log(`  Session 3: ${session3.id}`);

  await supabase.from('session_summaries').insert({
    session_id: session3.id,
    patient_id: patientId,
    summary_text: 'Ramesh presents with concern about CKD progression — eGFR declined from 62 (Apr) → 55 (Oct) → 48 (Jan), now stage 3b. Primary driver is diabetic nephropathy with HbA1c rising to 7.8% despite Metformin 1000mg. Ibuprofen was stopped per prior advice. Dietary compliance remains a challenge. Discussed Metformin dose reduction at current eGFR, SGLT2 inhibitor addition for renal protection, BP targets, and additional CKD monitoring (phosphorus, PTH, anemia tracking). Potassium borderline high at 4.8.',
    key_findings: [
      'CKD progressed to stage 3b (eGFR 48) — accelerated decline over 9 months',
      'HbA1c worsened to 7.8% — diabetes is primary driver of nephropathy',
      'Metformin dose needs reduction (1000mg → 500mg) at eGFR 48',
      'SGLT2 inhibitor (dapagliflozin) should be considered for renal protection',
      'Potassium 4.8 — borderline high, needs dietary counseling and monitoring',
      'Mild CKD-related anemia (Hb 12.1) — trending',
    ],
    follow_up_items: [
      'Nephrologist appointment to discuss SGLT2 inhibitor and Metformin dose reduction',
      'Check phosphorus, PTH, and iron studies',
      'Dietary counseling — low potassium, diabetic diet, renal diet overlap',
      'Recheck renal panel, HbA1c, and CBC in 6-8 weeks',
      'Monitor INR more frequently if kidney function continues to change',
      'Diabetes educator referral for lifestyle support',
    ],
  });

  await supabase.from('visit_records').insert({
    session_id: session3.id,
    patient_id: patientId,
    chief_complaint: 'Kidney function decline and worsening diabetes control',
    symptoms: [
      { name: 'Anxiety about CKD progression', severity: 'moderate', duration: 'Since recent labs' },
      { name: 'Difficulty with dietary compliance', severity: 'moderate', duration: 'Ongoing' },
      { name: 'Persistent hyperglycemia', severity: 'moderate', duration: '5 months' },
    ],
    assessment: 'Accelerated CKD progression (eGFR 62→48 over 9 months) driven primarily by diabetic nephropathy. HbA1c worsening to 7.8%. NSAID use stopped but damage may have contributed. Metformin dose requires adjustment. SGLT2 inhibitor addition warranted for dual glycemic and renal benefit. Borderline hyperkalemia requires dietary attention. CKD anemia developing.',
    diagnoses: [
      { condition: 'CKD stage 3b — diabetic nephropathy, progressive', confidence: 'confirmed' },
      { condition: 'Type 2 Diabetes — poorly controlled, HbA1c 7.8%', confidence: 'confirmed' },
      { condition: 'CKD-related anemia — mild', confidence: 'probable' },
      { condition: 'Borderline hyperkalemia', confidence: 'confirmed' },
    ],
    recommendations: [
      { type: 'medication', description: 'Reduce Metformin from 1000mg to 500mg twice daily', urgency: 'soon' },
      { type: 'medication', description: 'Discuss adding dapagliflozin 10mg with nephrologist', urgency: 'soon' },
      { type: 'test', description: 'Check phosphorus, PTH, iron studies, and reticulocytes', urgency: 'soon' },
      { type: 'referral', description: 'Nephrologist for CKD management optimization', urgency: 'soon' },
      { type: 'referral', description: 'Diabetes educator for dietary and lifestyle support', urgency: 'routine' },
      { type: 'test', description: 'Recheck renal panel, HbA1c, CBC in 6-8 weeks', urgency: 'routine' },
    ],
    follow_up: 'Nephrologist within 2 weeks. Recheck labs in 6-8 weeks. Dietary counseling. Monitor potassium closely.',
    red_flags: [
      { description: 'Rapid eGFR decline (>5 mL/min per year) — needs nephrology review', severity: 'high' },
    ],
    medication_changes: [
      { medication: 'Metformin', change: 'REDUCE from 1000mg to 500mg twice daily', reason: 'eGFR 48 — dose adjustment required' },
      { medication: 'Dapagliflozin 10mg', change: 'CONSIDER adding', reason: 'Renal protection in diabetic CKD' },
    ],
    confidence_score: 0.90,
    needs_review: false,
  });

  // ──────────────────────────────────────────────
  // Done!
  // ──────────────────────────────────────────────
  console.log('\n========================================');
  console.log('Demo account ready!');
  console.log('========================================');
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log(`Patient:  Ramesh Iyer, 67M`);
  console.log(`Profile:  Synthea "complex" — T2DM, HTN, COPD, CKD 3b, AFib, OA`);
  console.log(`Meds:     6 (Metformin, Lisinopril, Warfarin, Tiotropium, Gabapentin, Atorvastatin)`);
  console.log(`Docs:     15 medical documents (labs, imaging, prescriptions, discharge summary)`);
  console.log(`Sessions: 3 completed consultations with summaries and visit records`);
  console.log('========================================\n');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
