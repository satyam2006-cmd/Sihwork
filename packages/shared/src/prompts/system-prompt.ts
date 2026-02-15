import { TOKEN_BUDGET, estimateTokens } from '../context/token-budget';

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
    extracted_summary?: string | null;
    uploaded_at: string;
  }>;
  priorSessions: Array<{
    started_at: string;
    summary_text?: string;
    key_findings?: string[];
    follow_up_items?: string[];
  }>;
}

const PERSONA_SECTION = `You are Dr. AI, a thorough and empathetic virtual doctor providing second opinions. You are conducting a medical consultation.

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
- Use the get_patient_context tool when you need to look up document details or prior session history

EMERGENCY DETECTION - Use the flag_emergency tool if patient mentions:
- Chest pain with shortness of breath
- Sudden severe headache ("worst headache of my life")
- Signs of stroke (sudden numbness, confusion, trouble speaking/seeing)
- Severe allergic reaction (throat swelling, difficulty breathing)
- Active suicidal ideation
- Severe bleeding or trauma
- Loss of consciousness`;

/**
 * Build a token-aware system prompt.
 *
 * Always included (safety-critical): demographics, allergies, medications, conditions.
 * Included if budget allows: document summaries (newest first), prior session key findings.
 * Full document data and session details are lazy-loaded via the get_patient_context tool.
 */
export function buildSystemPrompt(ehrContext: EHRContext, tokenBudget?: number): string {
  const budget = tokenBudget ?? TOKEN_BUDGET.ehr_context;
  const sections: string[] = [PERSONA_SECTION];

  // ── Always included: demographics + safety-critical fields ──
  const p = ehrContext.patient;
  const toArray = (v: unknown): string[] => Array.isArray(v) ? v : [];
  const allergies = toArray(p.allergies);
  const conditions = toArray(p.chronic_conditions);
  const medications = toArray(p.current_medications);
  const patientSection = `\nPATIENT INFORMATION:
- Name: ${p.full_name}
- Date of Birth: ${p.date_of_birth || 'Not provided'}
- Gender: ${p.gender || 'Not provided'}
- Blood Type: ${p.blood_type || 'Not provided'}
- Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None recorded'}
- Chronic Conditions: ${conditions.length > 0 ? conditions.join(', ') : 'None recorded'}
- Current Medications: ${medications.length > 0 ? medications.join(', ') : 'None recorded'}`;

  sections.push(patientSection);

  // Track remaining EHR budget (persona is counted separately under system_prompt budget)
  let remainingBudget = budget - estimateTokens(patientSection);

  // ── Document summaries (newest first, only if we have budget) ──
  if (ehrContext.documents.length > 0 && remainingBudget > 200) {
    const docLines: string[] = ['\nMEDICAL DOCUMENTS ON FILE:'];
    for (const doc of ehrContext.documents) {
      const summary = doc.extracted_summary || '(Use get_patient_context tool to view details)';
      const line = `- ${doc.file_name} (${new Date(doc.uploaded_at).toLocaleDateString()}): ${summary}`;
      const lineCost = estimateTokens(line);

      if (remainingBudget - lineCost < 100) {
        docLines.push(`- ... and ${ehrContext.documents.length - docLines.length + 1} more documents (use get_patient_context tool to view)`);
        break;
      }

      docLines.push(line);
      remainingBudget -= lineCost;
    }
    docLines.push('(Use the get_patient_context tool with fields=["documents"] for full document details)');
    sections.push(docLines.join('\n'));
  }

  // ── Prior session key findings (most recent first, only key_findings) ──
  if (ehrContext.priorSessions.length > 0 && remainingBudget > 200) {
    const sessionLines: string[] = ['\nPRIOR CONSULTATION HISTORY:'];
    for (const session of ehrContext.priorSessions) {
      if (session.key_findings && session.key_findings.length > 0) {
        const line = `- Session ${new Date(session.started_at).toLocaleDateString()}: ${session.key_findings.join('; ')}`;
        const lineCost = estimateTokens(line);

        if (remainingBudget - lineCost < 50) break;

        sessionLines.push(line);
        remainingBudget -= lineCost;
      }
    }
    if (sessionLines.length > 1) {
      sections.push(sessionLines.join('\n'));
    }
  }

  return sections.join('\n');
}
