-- ============================================================================
-- 004_soap_ehr_letters.sql
-- SOAP notes, EHR entries, and clinical letters for post-session pipeline
-- ============================================================================

-- ============================================================================
-- 1. soap_notes (one per session)
-- ============================================================================
create table public.soap_notes (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  subjective      text not null,
  objective       text not null,
  assessment      text not null,
  plan            text not null,
  status          text not null default 'draft',
  edited_by       uuid references auth.users (id),
  edited_at       timestamptz,
  finalized_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint soap_notes_session_id_unique unique (session_id),
  constraint soap_notes_status_check
    check (status in ('draft', 'edited', 'finalized'))
);

create trigger set_soap_notes_updated_at
  before update on public.soap_notes
  for each row
  execute function public.handle_updated_at();

-- ============================================================================
-- 2. ehr_entries (one per session)
-- ============================================================================
create table public.ehr_entries (
  id                        uuid primary key default gen_random_uuid(),
  session_id                uuid not null references public.sessions (id) on delete cascade,
  patient_id                uuid not null references public.patients (id) on delete cascade,
  encounter_date            date not null default current_date,
  encounter_type            text not null default 'virtual_consultation',
  chief_complaint           text not null,
  history_of_present_illness text not null,
  past_medical_history      text,
  review_of_systems         jsonb,
  physical_exam             text,
  assessment_and_plan       text not null,
  diagnoses_icd             jsonb not null default '[]'::jsonb,
  procedures_cpt            jsonb not null default '[]'::jsonb,
  orders                    jsonb not null default '[]'::jsonb,
  prescriptions             jsonb not null default '[]'::jsonb,
  follow_up_instructions    text,
  status                    text not null default 'draft',
  edited_by                 uuid references auth.users (id),
  edited_at                 timestamptz,
  finalized_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint ehr_entries_session_id_unique unique (session_id),
  constraint ehr_entries_status_check
    check (status in ('draft', 'edited', 'finalized')),
  constraint ehr_entries_encounter_type_check
    check (encounter_type in ('virtual_consultation', 'follow_up', 'urgent', 'emergency'))
);

create trigger set_ehr_entries_updated_at
  before update on public.ehr_entries
  for each row
  execute function public.handle_updated_at();

-- ============================================================================
-- 3. clinical_letters (many per session)
-- ============================================================================
create table public.clinical_letters (
  id                      uuid primary key default gen_random_uuid(),
  session_id              uuid not null references public.sessions (id) on delete cascade,
  patient_id              uuid not null references public.patients (id) on delete cascade,
  letter_type             text not null,
  recipient_name          text,
  recipient_title         text,
  recipient_institution   text,
  subject_line            text not null,
  body                    text not null,
  generated_by            text not null default 'ai',
  status                  text not null default 'draft',
  edited_by               uuid references auth.users (id),
  edited_at               timestamptz,
  finalized_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint clinical_letters_status_check
    check (status in ('draft', 'edited', 'finalized')),
  constraint clinical_letters_type_check
    check (letter_type in ('referral', 'clinical_summary', 'follow_up', 'disability', 'insurance', 'specialist', 'other')),
  constraint clinical_letters_generated_by_check
    check (generated_by in ('ai', 'doctor'))
);

create trigger set_clinical_letters_updated_at
  before update on public.clinical_letters
  for each row
  execute function public.handle_updated_at();

-- ============================================================================
-- Indexes
-- ============================================================================
create index idx_soap_notes_session     on public.soap_notes (session_id);
create index idx_soap_notes_patient     on public.soap_notes (patient_id);
create index idx_ehr_entries_session    on public.ehr_entries (session_id);
create index idx_ehr_entries_patient    on public.ehr_entries (patient_id);
create index idx_clinical_letters_session on public.clinical_letters (session_id);
create index idx_clinical_letters_patient on public.clinical_letters (patient_id);

-- ============================================================================
-- Row Level Security (same pattern as visit_records — read-only for patients)
-- ============================================================================

-- ---- soap_notes ----
alter table public.soap_notes enable row level security;

create policy "soap_notes_select_own"
  on public.soap_notes for select
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

-- ---- ehr_entries ----
alter table public.ehr_entries enable row level security;

create policy "ehr_entries_select_own"
  on public.ehr_entries for select
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

-- ---- clinical_letters ----
alter table public.clinical_letters enable row level security;

create policy "clinical_letters_select_own"
  on public.clinical_letters for select
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );
