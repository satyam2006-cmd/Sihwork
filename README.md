# Second Opinion AI

AI-powered medical second opinion platform with bilingual voice support. Patients consult an AI doctor through text or voice (English and Hindi), and doctors review AI-generated clinical records on a separate portal.

Built with an agentic architecture — Claude uses MCP tools for all database operations and autonomously extracts structured clinical data from conversations.

## Architecture

```
apps/
  patient/          Next.js 16 — Patient portal (text + voice consultations)
  doctor/           Next.js 16 — Doctor review dashboard
packages/
  shared/           Shared library (conversation engine, speech APIs, prompts)
mcp/
  tools/            10 MCP tool handlers (all database operations)
  server.ts         MCP server (stdio transport)
  post-session-agent.ts   Agentic post-session extraction pipeline
server/
  ws-server.ts      WebSocket server for voice consultations
  session-manager.ts
supabase/
  migrations/       Database schema (patients, sessions, visit records, etc.)
```

### Key Design Decisions

- **MCP tool layer**: All Supabase operations go through 10 typed tool handlers, used both as importable functions and via the MCP protocol
- **Agentic conversation engine**: Claude calls tools during conversation (`flag_emergency`, `update_session_notes`, `get_patient_context`) via a `tool_use` loop
- **Agentic post-session pipeline**: After a session ends, a Claude agent autonomously extracts a structured visit record, writes a clinical summary, and updates the patient profile — replacing ~200 lines of imperative extraction code
- **Bilingual voice**: Sarvam AI for TTS/ASR in English and Hindi

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| AI | Claude (Anthropic SDK), tool_use for agentic loops |
| Speech | Sarvam AI (ASR + TTS), English and Hindi |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Protocol | Model Context Protocol (MCP) for all DB operations |
| Real-time | WebSocket server for voice sessions |

## Prerequisites

- Node.js 22+
- npm 10+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key
- A [Sarvam AI](https://www.sarvam.ai) API key (for voice features)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the database

Run the migration in your Supabase SQL Editor:

```bash
# Copy the contents of supabase/migrations/001_initial_schema.sql
# and execute it in Supabase Dashboard → SQL Editor
```

This creates all tables (`patients`, `sessions`, `visit_records`, `session_summaries`, `documents`, `doctors`), indexes, Row Level Security policies, and the `medical-documents` storage bucket.

### 3. Configure environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
SARVAM_API_KEY=sk_...
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

Then symlink it to both apps:

```bash
ln -s ../../.env.local apps/patient/.env.local
ln -s ../../.env.local apps/doctor/.env.local
```

### 4. Start development servers

```bash
# All services (patient app, doctor app, WebSocket server)
npm run dev:all

# Or individually:
npm run dev:patient   # http://localhost:3000
npm run dev:doctor    # http://localhost:3002
npm run dev:ws        # WebSocket on :3001
```

## Usage

### Patient Portal (`:3000`)

1. **Sign up** with email/password — a patient profile is created automatically
2. **Upload documents** (PDF medical records) — extracted via Claude
3. **Start a consultation** — choose text or voice mode
4. **Chat with Dr. AI** — the AI references your medical history, asks follow-up questions, and flags emergencies
5. **End session** — the post-session agent extracts a structured visit record and summary

### Doctor Portal (`:3002`)

1. **Sign in** with a doctor account (created via Supabase admin or SQL)
2. **Dashboard** — overview stats (total patients, sessions needing review, emergency flags)
3. **Patients** — browse patient list, view medical history and session history
4. **Sessions** — review AI-generated visit records and summaries, mark as reviewed

## MCP Tools

The 10 tool handlers in `mcp/tools/` cover all database operations:

| Tool | Description |
|------|-------------|
| `get_patient` | Lookup by patient_id or user_id, with optional includes |
| `update_patient` | Update profile fields or merge conditions/medications/allergies |
| `create_session` | Create a new consultation session |
| `get_session` | Get session with optional visit record, summary, patient name |
| `update_session` | Update transcript, status, language, emergency flags |
| `list_sessions` | List sessions with optional patient names and review status |
| `write_visit_record` | Write structured clinical visit record |
| `write_session_summary` | Write human-readable summary with key findings |
| `review_visit_record` | Mark a visit record as reviewed by a doctor |
| `manage_document` | Create, update status, or get document records |

### Running the MCP server standalone

```bash
npx tsx mcp/server.ts
```

This exposes all tools via the MCP protocol over stdio, compatible with any MCP client.

## Project Structure

```
apps/patient/src/
  app/
    api/
      session/          POST (create), GET (list)
      session/[id]/     GET, PATCH, complete, extract, summary, eval
      chat/             POST (send message to conversation engine)
      documents/        upload, extract
      patient/          PATCH (update profile)
    dashboard/
      page.tsx          Overview with stats and recent sessions
      consultation/     Session mode selection (text/voice)
      session/[id]/     Chat interface
      documents/        Upload and view medical documents

apps/doctor/src/
  app/
    api/
      patients/         GET (list), [id] GET (detail)
      sessions/         GET (list), [id] GET/PATCH (detail/review)
    dashboard/
      page.tsx          Stats overview
      patients/         Patient list and detail views
      sessions/         Session list and detail views

packages/shared/src/
  claude/
    conversation-engine.ts   Agentic conversation with tool_use loop
  prompts/
    system-prompt.ts         Doctor AI system prompt
  sarvam/
    tts.ts                   Text-to-speech (Sarvam Bulbul v2)
    asr.ts                   Speech-to-text (Sarvam Saaras v3)
  ehr/
    hydration.ts             Patient context hydration for conversations
```

## License

Private — all rights reserved.
