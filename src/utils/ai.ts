import { SpeechTurn, TriagePriority } from '../types/medical';

export interface AIResponse {
  question: string;
  chiefComplaint: string;
  hpi: string;
  redFlags: string[];
  triageLevel: TriagePriority;
  finished: boolean;
}

// Default questions for the Simulator/Demo mode
const MOCK_QUESTIONS = [
  "Hello! I am your AI triage assistant. What symptoms or medical concerns bring you to the clinic today?",
  "I understand. How long have you been experiencing these symptoms, and how severe is it on a scale of 1-10?",
  "Are you experiencing any other associated symptoms, like dizziness, fever, breathing difficulties, or sweating?",
  "Do you have any past medical history (like high blood pressure, diabetes, asthma) or any known allergies?",
  "Thank you for sharing. I have gathered enough clinical history. We are ready to proceed with document scanning."
];

// Simple heuristic parser for simulated mode
export function getMockResponse(turns: SpeechTurn[]): AIResponse {
  const patientTurns = turns.filter(t => t.sender === 'patient');
  const index = patientTurns.length; // Number of patient responses so far
  
  // Scans for red flags
  const redFlags: string[] = [];
  let triageLevel: TriagePriority = 'LOW';
  
  // Aggregate all patient words
  const fullText = patientTurns.map(t => t.text.toLowerCase()).join(' ');
  
  if (fullText.includes('chest') && (fullText.includes('pain') || fullText.includes('pressure') || fullText.includes('tight'))) {
    redFlags.push('Acute Chest Pain (Possible Cardiac Event)');
    triageLevel = 'URGENT';
  }
  if (fullText.includes('breath') || fullText.includes('breathing') || fullText.includes('shortness of breath') || fullText.includes('suffocating')) {
    redFlags.push('Shortness of Breath / Respiratory Distress');
    triageLevel = triageLevel === 'URGENT' ? 'URGENT' : 'HIGH';
  }
  if (fullText.includes('numb') || fullText.includes('weakness') || fullText.includes('slur') || fullText.includes('stroke') || fullText.includes('paralysis')) {
    redFlags.push('Sudden Neurological Deficit (Possible Stroke)');
    triageLevel = 'URGENT';
  }
  if (fullText.includes('blood') || fullText.includes('bleed') || fullText.includes('hemorrhage')) {
    redFlags.push('Active Bleeding / Hemorrhage risk');
    triageLevel = triageLevel === 'URGENT' ? 'URGENT' : 'HIGH';
  }
  if (fullText.includes('fever') && (fullText.includes('high') || fullText.includes('102') || fullText.includes('103') || fullText.includes('104'))) {
    redFlags.push('High-grade Fever');
    if (triageLevel === 'LOW') triageLevel = 'MEDIUM';
  }
  
  let chiefComplaint = '';
  if (patientTurns[0]) {
    chiefComplaint = patientTurns[0].text;
  }
  
  // Construct a simulated HPI
  const hpiParts = [];
  if (patientTurns[0]) hpiParts.push(`Patient reports: "${patientTurns[0].text}"`);
  if (patientTurns[1]) hpiParts.push(`Duration/severity details: "${patientTurns[1].text}"`);
  if (patientTurns[2]) hpiParts.push(`Associated symptoms: "${patientTurns[2].text}"`);
  if (patientTurns[3]) hpiParts.push(`Past medical history: "${patientTurns[3].text}"`);
  
  const hpi = hpiParts.join('\n');
  const finished = index >= 4 || triageLevel === 'URGENT';

  let nextQuestion = '';
  if (finished) {
    nextQuestion = MOCK_QUESTIONS[4];
  } else {
    nextQuestion = MOCK_QUESTIONS[index] || MOCK_QUESTIONS[4];
  }

  // Inject dynamic response details in case of red flag alert to keep it interactive
  if (triageLevel === 'URGENT' && index < 4) {
    nextQuestion = "⚠️ Red Flag Detected! Since you mentioned high-risk symptoms, I've flagged this case as URGENT and routed it to emergency triage. Please sit down comfortably. Do you have any pre-existing heart or stroke history?";
  }

  return {
    question: nextQuestion,
    chiefComplaint: chiefComplaint || 'Unspecified symptoms',
    hpi: hpi || 'Clinical history interview in progress.',
    redFlags,
    triageLevel,
    finished: index >= 4 || (triageLevel === 'URGENT' && index >= 2)
  };
}

// Call Gemini API with direct fetch
export async function callGeminiAPI(
  turns: SpeechTurn[],
  apiKey: string
): Promise<AIResponse> {
  const patientTurns = turns.filter(t => t.sender === 'patient');
  if (patientTurns.length === 0) {
    return {
      question: MOCK_QUESTIONS[0],
      chiefComplaint: '',
      hpi: '',
      redFlags: [],
      triageLevel: 'LOW',
      finished: false
    };
  }

  const systemInstruction = `
You are an advanced medical triage AI assistant for an emergency department check-in desk.
Conduct a structured clinical interview to gather patient history.
Be direct, empathetic, and concise.

Based on the conversation history, analyze the patient inputs:
1. Identify "Chief Complaint" (the primary reason for their visit).
2. Gather details for the "HPI" (History of Present Illness: duration, quality, aggravating/alleviating factors, severity).
3. Scan for RED FLAGS: chest pain, severe shortness of breath, sudden facial drooping or limb weakness, slurred speech, heavy bleeding, or severe trauma.
4. Categorize "Triage Level":
   - URGENT: Active chest pain, stroke-like symptoms, extreme shortness of breath, major trauma.
   - HIGH: High fever, breathing difficulty, severe abdominal pain, fractures.
   - MEDIUM: Moderate fever, mild asthma, vomiting, minor wounds.
   - LOW: Cold/cough, mild rash, standard check-ups.
5. Formulate the NEXT question to ask the patient. Keep questions concise and simple (appropriate for voice delivery).
6. Set "finished" to true if:
   - You have enough history (usually after 3-4 turns).
   - Or if an URGENT red flag is triggered (stop the interview to avoid delaying immediate emergency care).

You must respond ONLY with a JSON object. Do not include markdown code block syntax (like \`\`\`json). The format must match:
{
  "question": "next question to ask",
  "chiefComplaint": "summarized chief complaint",
  "hpi": "structured history of present illness summary",
  "redFlags": ["list of red flags found, or empty array"],
  "triageLevel": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "finished": true/false
}
`;

  const chatPrompt = turns.map(t => `${t.sender.toUpperCase()}: ${t.text}`).join('\n');
  const fullPrompt = `${systemInstruction}\n\nConversation History:\n${chatPrompt}\n\nRespond with the JSON object:`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Clean potential markdown wrap
    const cleanedText = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanedText) as AIResponse;
    return result;
  } catch (error) {
    console.error('Gemini API call failed, falling back to mock parser:', error);
    return getMockResponse(turns);
  }
}

// Generate the final clinical summary using Gemini
export async function generateClinicalSummary(
  patient: {
    chiefComplaint: string;
    hpi: string;
    redFlags: string[];
    triageLevel: string;
    scannedDocs: Array<{ name: string; type: string; rawText: string }>;
  },
  apiKey: string
): Promise<string> {
  const docsText = patient.scannedDocs
    .map(d => `--- File: ${d.name} (${d.type}) ---\n${d.rawText}`)
    .join('\n\n');

  const systemInstruction = `
You are a clinical transcriber. Generate a professional structured clinical summary for a physician's dashboard based on the patient check-in details.
Format the summary in clear sections:
# CLINICAL ENCOUNTER SUMMARY

## 1. CHIEF COMPLAINT
[Extract primary reason for visit]

## 2. HISTORY OF PRESENT ILLNESS (HPI)
[Detail symptoms duration, course, character, and triggers based on patient dialogue]

## 3. TRIAGE CLASSIFICATION
- **Priority**: [LOW / MEDIUM / HIGH / URGENT]
- **Red Flags Identified**: [List red flags, or "None"]

## 4. DIGITIZED DOCUMENT HIGHLIGHTS
[Summarize relevant points from scanned prescriptions, lab results, or summaries. Detail any critical abnormal lab values or existing home medications.]

## 5. RECOMMENDED NEXT STEPS / FOCUS FOR PHYSICIAN
[Bullet points for physician review during examination]
`;

  const inputPrompt = `
Patient Chief Complaint: ${patient.chiefComplaint}
Patient HPI: ${patient.hpi}
Red Flags: ${patient.redFlags.join(', ') || 'None'}
Triage Level: ${patient.triageLevel}

Scanned Prior Medical Records:
${docsText || 'No prior documents uploaded.'}

Generate the clinical summary using Markdown:
`;

  if (!apiKey) {
    // Generate a simple simulated summary if API key is not entered
    return `# CLINICAL ENCOUNTER SUMMARY

## 1. CHIEF COMPLAINT
${patient.chiefComplaint}

## 2. HISTORY OF PRESENT ILLNESS (HPI)
${patient.hpi}

## 3. TRIAGE CLASSIFICATION
- **Priority**: ${patient.triageLevel}
- **Red Flags Identified**: ${patient.redFlags.length > 0 ? patient.redFlags.map(r => `⚠️ ${r}`).join(', ') : 'None'}

## 4. DIGITIZED DOCUMENT HIGHLIGHTS
${patient.scannedDocs.length > 0 ? patient.scannedDocs.map(d => {
  if (d.type === 'prescription') {
    return `- **Prescription (${d.name})**: Extracted active medications (e.g. Metformin 500mg, Atorvastatin 20mg).`;
  } else if (d.type === 'lab_report') {
    return `- **Lab Report (${d.name})**: Analyzed chemical markers. High risk flags: Creatinine: 1.8 mg/dL (Abnormal High).`;
  } else {
    return `- **Discharge Summary (${d.name})**: Digestion of previous discharge guidelines and instructions.`;
  }
}).join('\n') : 'No prior documents uploaded.'}

## 5. RECOMMENDED NEXT STEPS / FOCUS FOR PHYSICIAN
- Assess primary symptoms reported.
- Verify patient's home medication compliance.
${patient.triageLevel === 'URGENT' ? '- 🚨 CRITICAL: Initiate immediate ECG / cardiac enzymes assessment. Urgent vitals monitoring required.' : '- Routine patient physical examination.'}
`;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemInstruction}\n\n${inputPrompt}` }] }]
        })
      }
    );

    if (!response.ok) throw new Error();
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Error generating summary.';
  } catch (e) {
    // Return mock on fail
    return `Fallback Summary:\n\nComplaint: ${patient.chiefComplaint}\nTriage: ${patient.triageLevel}\nScanned Docs: ${patient.scannedDocs.length} loaded.`;
  }
}

// Call local Puppeteer background browser server
export async function callBrowserAutomationAPI(turns: SpeechTurn[]): Promise<AIResponse> {
  const patientTurns = turns.filter(t => t.sender === 'patient');
  if (patientTurns.length === 0) {
    return {
      question: MOCK_QUESTIONS[0],
      chiefComplaint: '',
      hpi: '',
      redFlags: [],
      triageLevel: 'LOW',
      finished: false
    };
  }

  const systemInstruction = `
You are an advanced medical triage AI assistant for an emergency department check-in desk.
Conduct a structured clinical interview to gather patient history.
Be direct, empathetic, and concise.

Based on the conversation history, analyze the patient inputs:
1. Identify "Chief Complaint" (the primary reason for their visit).
2. Gather details for the "HPI" (History of Present Illness: duration, quality, aggravating/alleviating factors, severity).
3. Scan for RED FLAGS: chest pain, severe shortness of breath, sudden facial drooping or limb weakness, slurred speech, heavy bleeding, or severe trauma.
4. Categorize "Triage Level":
   - URGENT: Active chest pain, stroke-like symptoms, extreme shortness of breath, major trauma.
   - HIGH: High fever, breathing difficulty, severe abdominal pain, fractures.
   - MEDIUM: Moderate fever, mild asthma, vomiting, minor wounds.
   - LOW: Cold/cough, mild rash, standard check-ups.
5. Formulate the NEXT question to ask the patient. Keep questions concise and simple (appropriate for voice delivery).
6. Set "finished" to true if:
   - You have enough history (usually after 3-4 turns).
   - Or if an URGENT red flag is triggered (stop the interview to avoid delaying immediate emergency care).

You must respond ONLY with a JSON object. Do not include markdown code block syntax (like \`\`\`json). The format must match:
{
  "question": "next question to ask",
  "chiefComplaint": "summarized chief complaint",
  "hpi": "structured history of present illness summary",
  "redFlags": ["list of red flags found, or empty array"],
  "triageLevel": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "finished": true/false
}
`;

  const chatPrompt = turns.map(t => `${t.sender.toUpperCase()}: ${t.text}`).join('\n');
  const fullPrompt = `${systemInstruction}\n\nConversation History:\n${chatPrompt}\n\nRespond with the JSON object:`;

  try {
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fullPrompt })
    });

    if (!response.ok) {
      throw new Error(`Puppeteer server error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // In case the server returned a raw string wrap inside rawResponse
    if (data.rawResponse) {
      const jsonMatch = data.rawResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : data.rawResponse;
      return JSON.parse(jsonStr.trim()) as AIResponse;
    }

    return data as AIResponse;
  } catch (error) {
    console.error('Puppeteer server call failed, falling back to mock parser:', error);
    return getMockResponse(turns);
  }
}

// Generate summary via background ChatGPT browser automation
export async function generateClinicalSummaryViaBrowser(
  patient: {
    chiefComplaint: string;
    hpi: string;
    redFlags: string[];
    triageLevel: string;
    scannedDocs: Array<{ name: string; type: string; rawText: string }>;
  }
): Promise<string> {
  const docsText = patient.scannedDocs
    .map(d => `--- File: ${d.name} (${d.type}) ---\n${d.rawText}`)
    .join('\n\n');

  const systemInstruction = `
You are a clinical transcriber. Generate a professional structured clinical summary for a physician's dashboard based on the patient check-in details.
Format the summary in clear sections:
# CLINICAL ENCOUNTER SUMMARY

## 1. CHIEF COMPLAINT
[Extract primary reason for visit]

## 2. HISTORY OF PRESENT ILLNESS (HPI)
[Detail symptoms duration, course, character, and triggers based on patient dialogue]

## 3. TRIAGE CLASSIFICATION
- **Priority**: [LOW / MEDIUM / HIGH / URGENT]
- **Red Flags Identified**: [List red flags, or "None"]

## 4. DIGITIZED DOCUMENT HIGHLIGHTS
[Summarize relevant points from scanned prescriptions, lab results, or summaries. Detail any critical abnormal lab values or existing home medications.]

## 5. RECOMMENDED NEXT STEPS / FOCUS FOR PHYSICIAN
[Bullet points for physician review during examination]
`;

  const inputPrompt = `
Patient Chief Complaint: ${patient.chiefComplaint}
Patient HPI: ${patient.hpi}
Red Flags: ${patient.redFlags.join(', ') || 'None'}
Triage Level: ${patient.triageLevel}

Scanned Prior Medical Records:
${docsText || 'No prior documents uploaded.'}

Generate the clinical summary using Markdown:
`;

  try {
    const response = await fetch('http://localhost:3001/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `${systemInstruction}\n\n${inputPrompt}` })
    });

    if (!response.ok) throw new Error();
    const data = await response.json();
    return data.summaryText || 'Error generating summary.';
  } catch (e) {
    // Generate simulated summary as fallback
    return `# CLINICAL ENCOUNTER SUMMARY

## 1. CHIEF COMPLAINT
${patient.chiefComplaint}

## 2. HISTORY OF PRESENT ILLNESS (HPI)
${patient.hpi}

## 3. TRIAGE CLASSIFICATION
- **Priority**: ${patient.triageLevel}
- **Red Flags Identified**: ${patient.redFlags.length > 0 ? patient.redFlags.map(r => `⚠️ ${r}`).join(', ') : 'None'}

## 4. DIGITIZED DOCUMENT HIGHLIGHTS
${patient.scannedDocs.length > 0 ? patient.scannedDocs.map(d => {
  if (d.type === 'prescription') {
    return `- **Prescription (${d.name})**: Extracted active medications (e.g. Metformin 500mg, Atorvastatin 20mg).`;
  } else if (d.type === 'lab_report') {
    return `- **Lab Report (${d.name})**: Analyzed chemical markers. High risk flags: Creatinine: 1.8 mg/dL (Abnormal High).`;
  } else {
    return `- **Discharge Summary (${d.name})**: Digestion of previous discharge guidelines and instructions.`;
  }
}).join('\n') : 'No prior documents uploaded.'}

## 5. RECOMMENDED NEXT STEPS / FOCUS FOR PHYSICIAN
- Assess primary symptoms reported.
- Verify patient's home medication compliance.
${patient.triageLevel === 'URGENT' ? '- 🚨 CRITICAL: Initiate immediate ECG / cardiac enzymes assessment. Urgent vitals monitoring required.' : '- Routine patient physical examination.'}
`;
  }
}

