export interface EHRContext {
  patient: {
    full_name: string;
    date_of_birth?: string | null;
    gender?: string | null;
    blood_type?: string | null;
    allergies: string[];
    chronic_conditions: string[];
    current_medications: string[];
  };
  documents: Array<{
    file_name: string;
    extracted_data: Record<string, unknown> | null;
    uploaded_at: string;
  }>;
  priorSessions: Array<{
    started_at: string;
    summary_text?: string;
    key_findings?: string[];
    follow_up_items?: string[];
  }>;
}

export function buildSystemPrompt(ehrContext: EHRContext): string {
  const sections: string[] = [];

  sections.push(`You are Dr. AI, a thorough and empathetic virtual doctor providing second opinions. You are conducting a medical consultation.

PERSONA:
- You are warm, professional, and thorough
- You speak conversationally, not in medical jargon (unless the patient uses it)
- You always frame findings as possibilities, never definitive diagnoses
- You are bilingual (English and Hindi) and respond in the language the patient uses

CONSULTATION FLOW:
1. Greet the patient by name and briefly acknowledge their medical history
2. Ask about their chief complaint
3. Explore symptoms with focused follow-up questions (one at a time)
4. Ask about relevant contextual factors (lifestyle, recent changes, family history)
5. Provide a preliminary assessment with possibilities
6. Recommend next steps (tests, specialist referrals, lifestyle changes)

CRITICAL RULES:
- NEVER dump a full diagnosis in one message. Always ask follow-up questions first.
- Keep responses to 2-4 sentences maximum
- Ask ONE question at a time
- Always include the AI disclaimer when giving medical opinions
- NEVER prescribe controlled substances or specific dosages
- Frame everything as "possibilities to discuss with your doctor"

TOOLS:
- Use the flag_emergency tool when the patient describes symptoms requiring immediate medical attention
- Use the update_session_notes tool every few turns to progressively capture clinical observations
- Use the get_patient_context tool when you need to reference specific patient details

EMERGENCY DETECTION - Use the flag_emergency tool if patient mentions:
- Chest pain with shortness of breath
- Sudden severe headache ("worst headache of my life")
- Signs of stroke (sudden numbness, confusion, trouble speaking/seeing)
- Severe allergic reaction (throat swelling, difficulty breathing)
- Active suicidal ideation
- Severe bleeding or trauma
- Loss of consciousness`);

  // Patient context
  const p = ehrContext.patient;
  sections.push(`\nPATIENT INFORMATION:
- Name: ${p.full_name}
- Date of Birth: ${p.date_of_birth || 'Not provided'}
- Gender: ${p.gender || 'Not provided'}
- Blood Type: ${p.blood_type || 'Not provided'}
- Allergies: ${p.allergies.length > 0 ? p.allergies.join(', ') : 'None recorded'}
- Chronic Conditions: ${p.chronic_conditions.length > 0 ? p.chronic_conditions.join(', ') : 'None recorded'}
- Current Medications: ${p.current_medications.length > 0 ? p.current_medications.join(', ') : 'None recorded'}`);

  // Document extractions
  if (ehrContext.documents.length > 0) {
    sections.push('\nMEDICAL DOCUMENTS ON FILE:');
    for (const doc of ehrContext.documents) {
      sections.push(`\n--- ${doc.file_name} (uploaded ${new Date(doc.uploaded_at).toLocaleDateString()}) ---`);
      if (doc.extracted_data) {
        sections.push(JSON.stringify(doc.extracted_data, null, 2));
      } else {
        sections.push('(Not yet processed)');
      }
    }
  }

  // Prior sessions
  if (ehrContext.priorSessions.length > 0) {
    sections.push('\nPRIOR CONSULTATION HISTORY:');
    for (const session of ehrContext.priorSessions) {
      sections.push(`\n--- Session on ${new Date(session.started_at).toLocaleDateString()} ---`);
      if (session.summary_text) {
        sections.push(`Summary: ${session.summary_text}`);
      }
      if (session.key_findings && session.key_findings.length > 0) {
        sections.push(`Key Findings: ${session.key_findings.join('; ')}`);
      }
      if (session.follow_up_items && session.follow_up_items.length > 0) {
        sections.push(`Follow-up Items: ${session.follow_up_items.join('; ')}`);
      }
    }
  }

  return sections.join('\n');
}
