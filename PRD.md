# Second Opinion AI — Product Requirements Document

**Doc Type:** Technical Blueprint (PoC)
**Audience:** Engineering Team
**MVP Timeline:** 4 Days

---

## 1. Overview & Problem Statement

**Second Opinion AI** is a virtual hospital platform that provides patients with an AI-powered second opinion doctor. Patients can have a real-time voice conversation with a virtual doctor that reviews their medical history, proactively asks diagnostic questions, and provides assessment and recommendations — all in their preferred language.

### The Problem

- Getting a second medical opinion is expensive, time-consuming, and often inaccessible — especially in India where doctor-to-patient ratios are critically low.
- Language barriers prevent patients from effectively communicating symptoms and understanding diagnoses. Most digital health tools operate in English only.
- Medical records are fragmented. Patients carry paper reports, PDFs, and scattered digital records with no unified view. Doctors (human or virtual) lack full context when consulting.

### The Solution

An agentic virtual doctor that:
- **Speaks the patient's language** — real-time voice conversations with mid-conversation language switching (English + Hindi for MVP), powered by Sarvam APIs.
- **Builds context autonomously** — ingests uploaded reports, pulls EHR history, and progressively builds understanding through multi-turn clinical questioning.
- **Acts like a real clinician** — doesn't dump answers. Asks follow-ups, explores symptom patterns, considers medication interactions, flags emergencies.
- **Writes its own records** — extracts structured medical data from conversations and writes verified entries to an agentic EHR, tagged as AI-sourced.

## 2. MVP Scope

### In Scope (4-Day PoC)

| Feature | Description |
|---|---|
| **Patient login** | Simple auth via Supabase Auth. Single role: patient. |
| **Document upload** | Patient uploads PDF lab reports / medical documents. Claude extracts and structures the data. |
| **Virtual doctor (voice)** | Real-time voice consultation via Sarvam ASR/TTS + Claude reasoning. |
| **Multi-lingual** | English + Hindi with mid-conversation switching. |
| **Multi-turn conversation** | Proactive follow-up questions, symptom exploration, contextual awareness. |
| **EHR context injection** | Patient's history loaded before call starts, used throughout conversation. |
| **Structured data extraction** | Pydantic models for symptoms, vitals, assessments. Extracted during and after session. |
| **Agentic EHR writes** | Verified structured data written to Supabase via MCP, flagged as virtual-doctor-sourced. |
| **Emergency detection** | Real-time interruption if symptoms suggest a medical emergency. |
| **Eval harness (basic)** | LLM-as-judge for both extraction accuracy and conversation quality. |
| **Session summary** | Post-call summary visible to patient in dashboard. |

### Out of Scope (Future)

- Doctor and nurse login / interfaces
- AI scribe for human doctors
- Virtual nurse for vitals intake
- Video consultations
- IoT / wearable device integration
- OCR for photos of paper reports
- Languages beyond English + Hindi
- HIPAA / DISHA / ABDM compliance
- Lab test ordering or appointment scheduling (suggestions only)
- REPL environment for context debugging
- Human-in-the-loop review of virtual doctor sessions
- Fine-tuning with human labels (eval harness uses LLM-as-judge for PoC)

### User Stories (MVP)

1. **As a patient**, I can sign up, upload my medical reports, and have them automatically processed and stored in my health record.
2. **As a patient**, I can start a voice call with a virtual doctor who already knows my medical history.
3. **As a patient**, I can speak in Hindi or English (or switch between them) and the doctor responds in my language.
4. **As a patient**, I receive a thorough multi-turn consultation where the doctor asks follow-up questions rather than giving a one-shot answer.
5. **As a patient**, I am immediately warned if my symptoms suggest a medical emergency.
6. **As a patient**, I can view a summary of my consultation and see my health records updated with the findings.
7. **As a patient**, on my next visit the virtual doctor remembers my history and prior conversations.

## 3. System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  Auth /   │  │   Document   │  │   Voice    │  │  Patient  │  │
│  │  Login    │  │   Upload     │  │   Console  │  │ Dashboard │  │
│  └────┬─────┘  └──────┬───────┘  └─────┬──────┘  └─────┬─────┘  │
│       │               │          WebSocket│              │        │
└───────┼───────────────┼─────────────────┼──────────────┼────────┘
        │               │                 │              │
        ▼               ▼                 ▼              ▼
┌──────────────────────────────────────────────────────────────────┐
│                   BACKEND ORCHESTRATOR (Next.js API / Node)      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                  Session Manager                         │    │
│  │  - WebSocket handler                                     │    │
│  │  - Conversation state (messages[], EHR context, history) │    │
│  │  - Language state (auto-detected per utterance)          │    │
│  └──────────┬──────────────┬──────────────┬─────────────────┘    │
│             │              │              │                       │
│     ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼───────┐              │
│     │  Sarvam API  │ │ Claude   │ │  MCP Server  │              │
│     │  - ASR       │ │ API      │ │  (DB writes) │              │
│     │  - TTS       │ │ - Reason │ │              │              │
│     │  - Lang ID   │ │ - Extract│ │              │              │
│     └──────────────┘ │ - Eval   │ └──────┬───────┘              │
│                      └──────────┘        │                       │
└──────────────────────────────────────────┼───────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                    │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  Auth     │  │  EHR Tables  │  │  Document  │  │  Session  │  │
│  │          │  │  (patients,  │  │  Storage   │  │  Logs     │  │
│  │          │  │   visits,    │  │  (PDFs,    │  │           │  │
│  │          │  │   vitals,    │  │   reports) │  │           │  │
│  │          │  │   meds)      │  │            │  │           │  │
│  └──────────┘  └──────────────┘  └────────────┘  └───────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Request Flow: Voice Consultation

```
1. Patient clicks "Start Consultation"
2. Frontend opens WebSocket to Backend Orchestrator
3. Backend kicks off Pre-Call Setup:
   a. Query Supabase for patient EHR data
   b. Process any unprocessed uploaded documents via Claude
   c. Query prior session summaries for cross-session context
   d. Assemble initial context (system prompt + EHR + prior summaries)
   e. Signal frontend: "Ready"
4. Frontend begins streaming audio via WebSocket
5. For each audio chunk:
   a. Backend → Sarvam ASR (speech-to-text + language detection)
   b. English transcript → append to Claude messages[]
   c. Claude generates response (with emergency check)
   d. If emergency detected → interrupt flow, send alert
   e. English response → Sarvam TTS (in detected language)
   f. Audio response → WebSocket → Patient
   g. Every 3-4 turns: async background extraction (Pydantic)
6. Patient ends call
7. Post-session:
   a. Full transcript → Claude structured extraction
   b. Extracted data → eval harness verification
   c. Verified data → MCP → Supabase EHR (flagged as virtual-doctor)
   d. Generate session summary → store in Supabase
```

## 4. Agentic Workflow Design

The virtual doctor operates in three phases: **Pre-Call Setup**, **Active Conversation**, and **Post-Session Processing**. A backend orchestration service manages the entire pipeline.

### 4.1 Pre-Call Setup Phase

When a patient initiates a call, the frontend shows a "Setting up your call..." screen. During this time, the backend:

1. **EHR Hydration** — Queries Supabase for the patient's existing records: past visit summaries, conditions, medications, allergies, uploaded reports.
2. **Document Ingestion** — Documents are processed at upload time (Day 1 pipeline). During pre-call setup, the system checks for any unprocessed documents (`processed == false` in the `documents` table) and processes them as a fallback. Already-processed documents have their `extracted_data` loaded directly from the database.
3. **Context Assembly** — Builds the initial context payload: system prompt + patient history + extracted report data. This becomes the seed context for the conversation.

If the patient has no prior data, the system flags this so the virtual doctor knows to start with a full intake (pre-existing conditions, medications, allergies, family history).

**Target latency:** < 5 seconds for returning patients (cached EHR), < 15 seconds for first-time patients with uploaded documents.

### 4.2 Active Conversation Phase

#### 4.2.1 Audio Pipeline (Real-Time Streaming)

```
Patient (mic) → WebSocket → Backend Orchestrator
    → Sarvam ASR (speech-to-text, Hindi/English)
    → Language Detection (Sarvam handles this)
    → English transcript
    → Claude API (reasoning + response generation)
    → English response text
    → Sarvam TTS (text-to-speech in detected language)
    → WebSocket → Patient (speaker)
```

- **Transport:** WebSocket connection between frontend and backend orchestrator. The backend runs a custom Node.js server (not Next.js API routes, which don't support persistent WebSocket connections) using the `ws` library alongside Next.js. The orchestrator manages the Sarvam and Claude API calls sequentially.
- **Audio format:** Frontend captures audio via `getUserMedia` → MediaRecorder API, encoded as PCM 16-bit, 16kHz, mono (standard for speech APIs). Chunks are sent as binary WebSocket frames. Exact chunk size depends on Sarvam's ASR requirements — check their docs and default to 4096-byte frames.
- **Voice Activity Detection (VAD):** For the PoC, use push-to-talk (patient holds a button to speak). This avoids the complexity of silence detection while keeping the pipeline simple. Future: add browser-side VAD (e.g., `@ricky0123/vad-web`) for hands-free conversation.
- **Fallback:** If Sarvam is unavailable, the system falls back to the text-based chat UI built on Day 2. The backend detects Sarvam API errors and signals the frontend to switch modes.
- **Latency management:** During Claude inference (1-5s), the orchestrator streams a natural filler via Sarvam TTS ("Let me think about that..." / "Give me a moment..."). These fillers are pre-generated and cached.
- **Language switching:** Sarvam detects language per utterance. If a patient switches from English to Hindi mid-conversation, the ASR output adjusts automatically. For the PoC, Sarvam translates patient speech to English → Claude reasons in English → response is translated back to the detected language via Sarvam before TTS. (Future optimization: test sending Hindi directly to Claude to reduce latency — see Open Questions.)

#### 4.2.2 System Prompt Architecture

The virtual doctor's base prompt defines:

- **Persona:** A thorough, empathetic doctor conducting a second-opinion consultation
- **Behavior:** Proactively ask follow-up questions. Never give a complete assessment from a single question. Explore symptom history, severity, duration, triggers, family history, lifestyle factors.
- **Multi-turn mandate:** Each response should either (a) ask a clarifying/follow-up question, (b) summarize understanding and ask for confirmation, or (c) provide an assessment with caveats. Never dump a full diagnosis in one turn.
- **Safety guardrails:** Periodic disclaimer that this is an AI second opinion, not a replacement for in-person care. Never prescribe controlled substances. Never provide definitive diagnoses — always frame as "based on what you've described, this could be..."
- **Emergency detection instructions:** If symptoms suggest a medical emergency (chest pain + shortness of breath, stroke symptoms, severe allergic reaction, etc.), immediately interrupt and direct the patient to emergency services.

#### 4.2.3 Proactive Questioning Engine

The virtual doctor follows a medical consultation flow, dynamically adapting based on context:

```
Introduction & Rapport
    → "Hi [name], I'm your virtual doctor. I've reviewed your recent reports..."
    → Acknowledge known history from EHR

Chief Complaint
    → "What brings you in today?"
    → Open-ended, let patient describe

Symptom Exploration (multi-turn, 3-8 questions typically)
    → Duration: "How long have you been experiencing this?"
    → Severity: "On a scale of 1-10..."
    → Pattern: "Is it constant or does it come and go?"
    → Triggers: "Does anything make it worse or better?"
    → Associated symptoms: "Have you noticed any [related symptom]?"
    → History: "Have you had this before?"

Contextual Follow-ups (driven by EHR + conversation)
    → Medication interactions: "I see you're on [med]. Have you noticed..."
    → Family history gaps: "Any family history of [relevant condition]?"
    → Lifestyle factors: "How's your sleep/diet/stress been?"

Assessment & Recommendations
    → Summarize findings
    → Suggest possible conditions (with confidence caveats)
    → Recommend lab tests or follow-ups
    → Flag if in-person visit is advisable
```

The question selection is **not scripted** — Claude dynamically decides the next question based on the full conversation context + EHR data. The system prompt instructs it to behave like a thorough clinician, not a chatbot following a decision tree.

#### 4.2.4 Progressive Context Assembly

As the conversation unfolds:

- **Within a session:** Full conversation history is maintained in the Claude API messages array. No summarization within a single session (context window is large enough for a consultation).
- **Across sessions:** A cross-session memory layer stores key facts, preferences, and ongoing conditions. For the PoC, implement this as a `session_summaries` query in Supabase (pull prior session summaries into context). If richer memory is needed, upgrade to mem0 post-PoC (see Open Questions #4).
- **Live structured extraction:** After every 3-4 conversational turns, a background Claude call extracts structured data (Pydantic models) from the conversation so far. This runs async and doesn't block the conversation.

#### 4.2.5 Emergency Detection & Interruption

Runs as a parallel check on every patient utterance:

- **Trigger:** Claude evaluates each patient message against emergency criteria as part of its reasoning (not a separate model call — built into the system prompt).
- **Action on detection:** The virtual doctor immediately interrupts the consultation flow:
  > "I need to pause our conversation. Based on what you're describing — [specific symptoms] — this could be a medical emergency. Please call emergency services or go to your nearest emergency room immediately. Do not wait."
- **Post-interruption:** Session status is set to `'emergency'` in the sessions table. The conversation can continue if the patient confirms they're safe, but the recommendation is logged.

### 4.3 Post-Session Processing

When the call ends:

1. **Final Structured Extraction** — Claude processes the full conversation transcript and extracts all structured medical data via Pydantic models:
   - Chief complaint
   - Symptoms (with severity, duration, pattern)
   - Vitals (if reported by patient)
   - Assessment / differential considerations
   - Recommendations (labs, follow-ups, lifestyle changes)
   - Emergency flags (if any)

2. **Eval Harness Verification** — A separate LLM call reviews the extracted structured data against the raw transcript to verify accuracy (see Section 7).

3. **EHR Write via MCP** — Verified structured data is written to Supabase. Every record is tagged with:
   - `source: "virtual-doctor"`
   - `verified_by: "eval-harness"`
   - `session_id` for traceability
   - `confidence_score` from the eval harness

4. **Session Summary** — A human-readable visit summary is generated and stored. This is what the patient sees in their dashboard and what a human doctor would see if they review the record later.

### 4.4 Conversation State Management

```
┌─────────────────────────────────────────────┐
│           Backend Orchestrator              │
│                                             │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Sarvam  │  │  Claude   │  │ Supabase  │  │
│  │ ASR/TTS │  │  API      │  │ (EHR +    │  │
│  │         │  │           │  │  State)   │  │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  │
│       │            │               │        │
│  ┌────▼────────────▼───────────────▼────┐   │
│  │       Session State Manager          │   │
│  │  - Conversation history (messages[]) │   │
│  │  - EHR context (pre-loaded)          │   │
│  │  - Prior session summaries           │   │
│  │  - Extracted data (running Zod)      │   │
│  │  - Language preference (auto-detect) │   │
│  │  - Emergency flag                    │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

The orchestrator holds all state in-memory for the duration of a session. On session end, everything is persisted to Supabase.

## 5. Tech Stack & Integrations

### Core Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js (React) | Patient UI, dashboard, voice console |
| **Backend** | Next.js API Routes / Node.js | Orchestration, WebSocket server, API relay |
| **Database** | Supabase (PostgreSQL) | EHR storage, auth, file storage, session logs |
| **Auth** | Supabase Auth | Patient signup/login |
| **File Storage** | Supabase Storage | Uploaded PDFs, reports |

### AI / ML Services

| Service | Provider | Purpose |
|---|---|---|
| **ASR (Speech-to-Text)** | Sarvam AI | Hindi + English real-time transcription |
| **TTS (Text-to-Speech)** | Sarvam AI | Response audio in detected language |
| **Language Detection** | Sarvam AI (built into ASR) | Detect language per utterance for mid-conversation switching |
| **Reasoning / Conversation** | Claude API (Anthropic) | Virtual doctor intelligence, multi-turn reasoning |
| **Structured Extraction** | Claude API + Pydantic | Extract medical data from conversation into typed models |
| **Eval Harness** | Claude API (separate call) | Verify extraction accuracy + conversation quality |
| **Long-term Memory** | mem0 | Cross-session patient memory |

### Infrastructure

| Component | Technology | Notes |
|---|---|---|
| **Real-time transport** | WebSocket (via Next.js or ws library) | Audio streaming between frontend and backend |
| **DB Access from Agent** | MCP Server (custom, Node.js) | Thin write layer: the orchestrator calls MCP tools to write structured data to Supabase. Uses `@modelcontextprotocol/sdk` (TypeScript). Exposes tools: `write_visit_record`, `write_session_summary`, `update_patient_record`. Connects to Supabase via `@supabase/supabase-js` with a service role key. |
| **Deployment (PoC)** | localhost (frontend) + Supabase (backend/DB) | No cloud deployment for PoC |

### Key API Integrations

**Sarvam AI**
- ASR endpoint: streaming audio → text + language ID
- TTS endpoint: text + target language → audio
- Docs: https://docs.sarvam.ai

**Claude API (Anthropic)**
- Messages API with streaming for real-time conversation
- Multimodal input for PDF/document processing
- Structured output (tool use or JSON mode) for extraction

**Model selection by task:**

| Task | Model | Rationale |
|---|---|---|
| Virtual doctor conversation | Claude Sonnet 4.5 | Best balance of speed and quality for real-time multi-turn |
| Document extraction (PDF) | Claude Sonnet 4.5 | Multimodal, strong at structured extraction |
| Post-session visit extraction | Claude Sonnet 4.5 | Accuracy matters, not latency-sensitive |
| Eval harness (extraction accuracy) | Claude Sonnet 4.5 | Separate call, needs strong reasoning |
| Eval harness (conversation quality) | Claude Sonnet 4.5 | Async, quality of judgment matters |

For the PoC, use Sonnet 4.5 across the board. If conversation latency is too high, test Haiku 4.5 for the real-time conversation loop.

**Cross-session memory (PoC approach)**
- Use Supabase `session_summaries` table — query prior summaries for the patient during pre-call setup
- Inject last 3-5 session summaries into the system prompt as context
- No external dependency needed for the PoC
- Future: evaluate mem0 (cloud or self-hosted) for richer semantic memory if summarized context proves insufficient

## 6. Data Model

### EHR Schema (Supabase / PostgreSQL)

```sql
-- Core patient record
patients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id),
  full_name       text NOT NULL,
  date_of_birth   date,
  gender          text,
  blood_group     text,
  allergies       text[],
  chronic_conditions text[],
  current_medications jsonb,  -- [{name, dosage, frequency, since}]
  emergency_contact jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Uploaded documents (PDFs, reports)
documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid REFERENCES patients(id),
  file_path       text NOT NULL,          -- Supabase Storage path
  file_type       text,                   -- 'pdf', 'image', 'docx'
  original_name   text,
  extracted_data  jsonb,                  -- Claude's structured extraction
  processed       boolean DEFAULT false,
  uploaded_at     timestamptz DEFAULT now()
);

-- Consultation sessions
sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid REFERENCES patients(id),
  started_at      timestamptz DEFAULT now(),
  ended_at        timestamptz,
  transcript      jsonb,                  -- Full conversation messages[]
  language_used   text[],                 -- ['en', 'hi']
  emergency_flag  boolean DEFAULT false,
  status          text DEFAULT 'active',  -- 'active', 'completed', 'emergency'
);

-- Structured visit data (extracted by agent, verified by eval)
visit_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid REFERENCES sessions(id),
  patient_id      uuid REFERENCES patients(id),
  chief_complaint text,
  symptoms        jsonb,    -- [{name, severity, duration, pattern, triggers}]
  vitals          jsonb,    -- {bp, heart_rate, temperature, ...} (patient-reported)
  assessment      text,
  differential    text[],   -- Possible conditions considered
  recommendations jsonb,    -- [{type: 'lab'|'followup'|'lifestyle', detail: '...'}]
  source          text DEFAULT 'virtual-doctor',
  verified_by     text DEFAULT 'eval-harness',
  confidence_score float,
  needs_review    boolean DEFAULT false,  -- Set when confidence_score between 0.5 and 0.8
  created_at      timestamptz DEFAULT now()
);

-- Session summaries (human-readable)
session_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid REFERENCES sessions(id),
  patient_id      uuid REFERENCES patients(id),
  summary_text    text,
  key_findings    text[],
  follow_up_items text[],
  created_at      timestamptz DEFAULT now()
);
```

### Zod Schemas (Structured Extraction)

Since the stack is TypeScript end-to-end, extraction schemas are defined in Zod. The Claude API returns JSON matching these schemas via structured output (tool use). Python Pydantic equivalents can be derived if a Python service is introduced later.

```typescript
// Document extraction — for uploaded PDFs/reports
const LabResult = z.object({
  test_name: z.string(),
  value: z.string(),
  unit: z.string().nullable(),
  reference_range: z.string().nullable(),
  abnormal: z.boolean(),
});

const DocumentExtraction = z.object({
  document_type: z.enum(["lab_report", "prescription", "discharge_summary", "imaging_report", "other"]),
  date: z.string().nullable(),                    // Date on the document
  provider: z.string().nullable(),                // Hospital/lab name
  lab_results: z.array(LabResult).optional(),     // For lab reports
  medications: z.array(z.object({
    name: z.string(),
    dosage: z.string().nullable(),
    frequency: z.string().nullable(),
  })).optional(),                                  // For prescriptions
  diagnoses: z.array(z.string()).optional(),       // For discharge summaries
  summary: z.string(),                            // Free-text summary of the document
  raw_findings: z.string().nullable(),            // Full extracted text for context
});

// Visit extraction — for conversation sessions
```

```python
# Equivalent Pydantic models (reference only — not used in PoC runtime)

class Symptom(BaseModel):
    name: str
    severity: int | None          # 1-10 scale
    duration: str | None          # "3 days", "2 weeks"
    pattern: str | None           # "constant", "intermittent", "worsening"
    triggers: list[str] | None

class Vitals(BaseModel):
    blood_pressure: str | None    # "120/80"
    heart_rate: int | None
    temperature: float | None
    spo2: int | None
    weight: float | None

class Recommendation(BaseModel):
    type: Literal["lab_test", "follow_up", "lifestyle", "medication_review", "specialist_referral"]
    detail: str
    urgency: Literal["routine", "soon", "urgent"]

class VisitExtraction(BaseModel):
    chief_complaint: str
    symptoms: list[Symptom]
    vitals: Vitals | None
    assessment: str
    differential_considerations: list[str]
    recommendations: list[Recommendation]
    emergency_detected: bool
    confidence_notes: str | None   # Agent's self-assessment of extraction quality
```

## 7. Eval Harness

The eval harness serves two purposes: (1) verifying structured data extraction accuracy before EHR writes, and (2) assessing conversation quality for iteration.

### 7.1 Extraction Accuracy (Gate for EHR Writes)

Runs after every session before data is written to the EHR.

**Input:** Raw conversation transcript + `VisitExtraction` Pydantic output
**Evaluator:** Separate Claude API call with a dedicated eval prompt

**Checks:**
- **Faithfulness:** Does every field in the extraction map to something actually said in the conversation? No hallucinated symptoms or vitals.
- **Completeness:** Were any symptoms, medications, or key details mentioned in the conversation but missing from the extraction?
- **Correctness:** Are severity scores, durations, and vitals accurately captured? (e.g., patient said "140 over 90" → `blood_pressure: "140/90"`)
- **Consistency:** Do the assessment and differential align with the symptoms extracted?

**Output:**
```python
class ExtractionEval(BaseModel):
    overall_pass: bool
    confidence_score: float          # 0.0 - 1.0
    faithfulness_issues: list[str]   # Hallucinated fields
    completeness_gaps: list[str]     # Missed information
    correctness_errors: list[str]    # Wrong values
    notes: str | None
```

**Behavior:**
- If `overall_pass == True` and `confidence_score >= 0.8`: write to EHR automatically.
- If `confidence_score` between 0.5 and 0.8: write to EHR with a `needs_review` flag.
- If `overall_pass == False` or `confidence_score < 0.5`: retry extraction once. If still failing, store raw transcript only — no structured EHR write.

### 7.2 Conversation Quality (Async, for Iteration)

Runs async after session completion. Not a gate — used for improving the system.

**Input:** Full conversation transcript + patient EHR context that was available
**Evaluator:** Separate Claude API call

**Rubric:**

| Dimension | What it measures |
|---|---|
| **Clinical thoroughness** | Did the doctor explore symptoms adequately? Ask about duration, severity, triggers, history? |
| **Proactive questioning** | Did the doctor ask relevant follow-ups, or just respond to what the patient said? |
| **Context utilization** | Did the doctor reference EHR data when relevant? (e.g., mentioning existing medications) |
| **Safety** | Were appropriate disclaimers given? Was emergency detection triggered when it should have been? |
| **Communication quality** | Was the doctor empathetic, clear, and appropriately paced? Not too verbose, not too terse? |
| **Multi-turn coherence** | Did the conversation flow logically? No repeated questions, no contradictions? |

**Output:**
```python
class ConversationEval(BaseModel):
    overall_score: float              # 1-10
    clinical_thoroughness: float      # 1-10
    proactive_questioning: float      # 1-10
    context_utilization: float        # 1-10
    safety: float                     # 1-10
    communication_quality: float      # 1-10
    multi_turn_coherence: float       # 1-10
    strengths: list[str]
    improvement_areas: list[str]
    critical_issues: list[str]        # Things that must be fixed
```

### 7.3 Future: Human Labels

The PoC uses LLM-as-judge for both eval types. Future versions will:
- Collect human clinician ratings on the same rubric
- Compare LLM-as-judge scores against human labels
- Fine-tune the eval prompts to better correlate with human judgment
- Build a labeled dataset for potential model fine-tuning

## 8. 4-Day Build Plan

### Day 1: Foundation

**Goal:** Patient can sign up, upload documents, and see extracted data.

- [ ] Initialize Next.js project with TypeScript
- [ ] Set up Supabase project: auth, database tables (patients, documents), storage bucket
- [ ] Build patient auth flow (signup / login via Supabase Auth)
- [ ] Build document upload UI + Supabase Storage integration
- [ ] Implement Claude API integration for document processing (PDF → structured extraction)
- [ ] Build basic patient dashboard showing uploaded documents + extracted data
- [ ] Define Zod schemas for `DocumentExtraction` and `VisitExtraction`

**Deliverable:** Working auth + upload + extraction pipeline.

### Day 2: Conversational Agent Core

**Goal:** Text-based virtual doctor conversation works end-to-end.

- [ ] Implement Claude Messages API integration with streaming
- [ ] Build the virtual doctor system prompt (persona, multi-turn behavior, proactive questioning, safety guardrails)
- [ ] Implement pre-call EHR hydration: query patient data → assemble context → inject into system prompt
- [ ] Build chat UI for text-based conversation (WebSocket or SSE)
- [ ] Implement progressive context assembly (conversation history in messages[])
- [ ] Implement emergency detection logic (built into system prompt + response parsing)
- [ ] Test multi-turn conversation flow: intro → complaint → exploration → assessment

**Deliverable:** Working text-based virtual doctor with EHR context.

### Day 3: Voice + Multi-lingual

**Goal:** Voice conversation in English and Hindi.

- [ ] Integrate Sarvam ASR API (speech-to-text streaming)
- [ ] Integrate Sarvam TTS API (text-to-speech with language selection)
- [ ] Build backend orchestrator: audio → Sarvam ASR → Claude → Sarvam TTS → audio
- [ ] Implement WebSocket audio streaming (frontend ↔ backend)
- [ ] Build voice console UI (mic input, audio playback, "Setting up your call..." state)
- [ ] Implement language detection pass-through (Sarvam auto-detects, response in same language)
- [ ] Add natural filler phrases during inference latency
- [ ] Test Hindi ↔ English mid-conversation switching

**Deliverable:** Working voice-based virtual doctor in English + Hindi.

### Day 4: EHR Pipeline + Eval + Polish

**Goal:** Agentic EHR writes, eval harness, session summaries.

- [ ] Implement post-session structured extraction (full transcript → Pydantic models)
- [ ] Build MCP server for Supabase writes (visit_records, session_summaries)
- [ ] Implement extraction eval harness (LLM-as-judge, confidence scoring, pass/fail gate)
- [ ] Implement conversation quality eval (async, stores scores)
- [ ] Build session summary generation + display in patient dashboard
- [ ] Implement cross-session memory: query prior session summaries during pre-call setup, inject into context
- [ ] End-to-end testing: upload docs → start voice call → conversation → EHR write → summary
- [ ] Bug fixes and UX polish

**Deliverable:** Complete PoC — voice consultation with agentic EHR and eval harness.

## 9. Open Questions & Risks

### Open Questions

| # | Question | Context | Impact |
|---|---|---|---|
| 1 | **Sarvam streaming latency** | Real-time ASR + TTS adds latency on top of Claude inference. What's the end-to-end round-trip? | May need to adjust filler strategy or consider chunked responses. **Action:** Benchmark on Day 3 morning before building the full pipeline. |
| 2 | **Translation vs. native Hindi reasoning** | PoC uses Sarvam for translation (Claude reasons in English). But Claude handles Hindi reasonably well natively — skipping translation could reduce latency. | **Decision:** Use translation for PoC. Benchmark native Hindi reasoning as a Day 3 stretch goal. |
| 3 | **Sarvam API pricing & rate limits** | Real-time streaming may hit rate limits or incur significant cost during testing. | **Action:** Check Sarvam's pricing model before Day 3. |
| 4 | **Sarvam ASR streaming protocol** | Does Sarvam support true WebSocket streaming, or is it batch REST with audio file upload? This determines the real-time architecture. | **Action:** Verify against Sarvam docs on Day 3 morning. If batch-only, use turn-based recording (record full utterance → send → get response). |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Latency too high for natural conversation** | Medium | High | Pre-generate filler phrases. Fall back to Haiku 4.5 for conversation if Sonnet 4.5 is too slow. Test Sarvam streaming latency early on Day 3. |
| **Hindi medical terminology accuracy** | Medium | Medium | Claude may not know niche Hindi medical terms. Sarvam translation may lose nuance. Test with common conditions first. |
| **Structured extraction hallucination** | Medium | High | Eval harness is the mitigation. Low-confidence extractions don't get written to EHR. |
| **4-day timeline is aggressive** | High | Medium | Prioritize ruthlessly. Day 1-2 are the core. Day 3 voice can fall back to text-only if Sarvam integration takes longer. Day 4 eval can be simplified. |
| **Emergency detection false positives/negatives** | Low | Very High | False positives are acceptable (better safe). False negatives are dangerous. Test with known emergency symptom patterns. Add a broad list of trigger symptoms to the system prompt. |
| **WebSocket stability for long consultations** | Low | Medium | Add reconnection logic. Store conversation state server-side so a reconnect resumes mid-conversation. |
