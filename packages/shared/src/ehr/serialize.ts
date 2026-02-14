import type { EHRContext } from '../prompts/system-prompt';

/**
 * Serialize an EHRContext into a plain-text string suitable for use as
 * temporal context in extraction prompts and post-session agents.
 *
 * Unlike `buildSystemPrompt()`, this does NOT include persona/instructions —
 * it only renders the patient's medical data.
 */
export function serializeEHRContext(ehrContext: EHRContext): string {
  const sections: string[] = [];

  // Demographics
  const p = ehrContext.patient;
  const lines = [
    `Patient: ${p.full_name}`,
    p.date_of_birth ? `DOB: ${p.date_of_birth}` : null,
    p.gender ? `Gender: ${p.gender}` : null,
    p.blood_type ? `Blood Type: ${p.blood_type}` : null,
    p.allergies.length > 0 ? `Allergies: ${p.allergies.join(', ')}` : null,
    p.chronic_conditions.length > 0 ? `Chronic Conditions: ${p.chronic_conditions.join(', ')}` : null,
    p.current_medications.length > 0 ? `Current Medications: ${p.current_medications.join(', ')}` : null,
  ].filter(Boolean);
  sections.push(lines.join('\n'));

  // Document summaries
  if (ehrContext.documents.length > 0) {
    const docLines = ['Medical Documents:'];
    for (const doc of ehrContext.documents) {
      const summary = doc.extracted_summary || '(no summary)';
      docLines.push(`- ${doc.file_name} (${new Date(doc.uploaded_at).toLocaleDateString()}): ${summary}`);
    }
    sections.push(docLines.join('\n'));
  }

  // Prior sessions
  if (ehrContext.priorSessions.length > 0) {
    const sessionLines = ['Prior Consultations:'];
    for (const session of ehrContext.priorSessions) {
      const date = new Date(session.started_at).toLocaleDateString();
      if (session.summary_text) {
        sessionLines.push(`- ${date}: ${session.summary_text}`);
      }
      if (session.key_findings && session.key_findings.length > 0) {
        sessionLines.push(`  Key findings: ${session.key_findings.join('; ')}`);
      }
      if (session.follow_up_items && session.follow_up_items.length > 0) {
        sessionLines.push(`  Follow-up: ${session.follow_up_items.join('; ')}`);
      }
    }
    if (sessionLines.length > 1) {
      sections.push(sessionLines.join('\n'));
    }
  }

  return sections.join('\n\n');
}
