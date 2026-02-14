-- ============================================================================
-- 001_initial_schema.sql
-- Complete database schema for the Virtual Hospital (Second Opinion AI) app
-- ============================================================================

-- =========================
-- Extensions
-- =========================
create extension if not exists "pgcrypto";

-- =========================
-- Helper: updated_at trigger
-- =========================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. patients
-- ============================================================================
create table public.patients (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  full_name       text not null,
  date_of_birth   date,
  gender          text,
  phone           text,
  blood_type      text,
  allergies       jsonb not null default '[]'::jsonb,
  chronic_conditions jsonb not null default '[]'::jsonb,
  current_medications jsonb not null default '[]'::jsonb,
  emergency_contact jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint patients_user_id_unique unique (user_id)
);

-- Apply the updated_at trigger to patients
create trigger set_patients_updated_at
  before update on public.patients
  for each row
  execute function public.handle_updated_at();

-- ============================================================================
-- 2. documents
-- ============================================================================
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id) on delete cascade,
  file_name        text not null,
  file_path        text not null,
  file_size        integer not null,
  mime_type        text not null,
  status           text not null default 'uploaded',
  extracted_data   jsonb,
  extraction_error text,
  uploaded_at      timestamptz not null default now(),
  processed_at     timestamptz,

  constraint documents_status_check
    check (status in ('uploaded', 'processing', 'processed', 'failed'))
);

-- ============================================================================
-- 3. sessions
-- ============================================================================
create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients (id) on delete cascade,
  status            text not null default 'active',
  mode              text not null default 'text',
  language          text not null default 'en',
  transcript        jsonb not null default '[]'::jsonb,
  emergency_flagged boolean not null default false,
  emergency_details text,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  metadata          jsonb not null default '{}'::jsonb,

  constraint sessions_status_check
    check (status in ('active', 'completed', 'abandoned')),
  constraint sessions_mode_check
    check (mode in ('text', 'voice'))
);

-- ============================================================================
-- 4. visit_records
-- ============================================================================
create table public.visit_records (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions (id) on delete cascade,
  patient_id        uuid not null references public.patients (id) on delete cascade,
  chief_complaint   text,
  symptoms          jsonb not null default '[]'::jsonb,
  vitals            jsonb,
  assessment        text,
  recommendations   jsonb not null default '[]'::jsonb,
  diagnoses         jsonb not null default '[]'::jsonb,
  follow_up         text,
  source            text not null default 'ai_extraction',
  confidence_score  double precision,
  needs_review      boolean not null default false,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

-- ============================================================================
-- 5. session_summaries
-- ============================================================================
create table public.session_summaries (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  summary_text    text not null,
  key_findings    jsonb not null default '[]'::jsonb,
  follow_up_items jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),

  constraint session_summaries_session_id_unique unique (session_id)
);

-- ============================================================================
-- 6. doctors
-- ============================================================================
create table public.doctors (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  full_name       text not null,
  specialization  text,
  created_at      timestamptz not null default now(),

  constraint doctors_user_id_unique unique (user_id)
);

-- ============================================================================
-- Indexes (for common query patterns)
-- ============================================================================
create index idx_patients_user_id       on public.patients (user_id);
create index idx_documents_patient_id   on public.documents (patient_id);
create index idx_sessions_patient_id    on public.sessions (patient_id);
create index idx_visit_records_session  on public.visit_records (session_id);
create index idx_visit_records_patient  on public.visit_records (patient_id);
create index idx_session_summaries_patient on public.session_summaries (patient_id);
create index idx_doctors_user_id        on public.doctors (user_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- ---- patients ----
alter table public.patients enable row level security;

create policy "patients_select_own"
  on public.patients for select
  using (user_id = auth.uid());

create policy "patients_insert_own"
  on public.patients for insert
  with check (user_id = auth.uid());

create policy "patients_update_own"
  on public.patients for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "patients_delete_own"
  on public.patients for delete
  using (user_id = auth.uid());

-- ---- documents ----
alter table public.documents enable row level security;

create policy "documents_select_own"
  on public.documents for select
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

create policy "documents_insert_own"
  on public.documents for insert
  with check (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

create policy "documents_update_own"
  on public.documents for update
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  )
  with check (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

create policy "documents_delete_own"
  on public.documents for delete
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

-- ---- sessions ----
alter table public.sessions enable row level security;

create policy "sessions_select_own"
  on public.sessions for select
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

create policy "sessions_insert_own"
  on public.sessions for insert
  with check (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

create policy "sessions_update_own"
  on public.sessions for update
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  )
  with check (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

create policy "sessions_delete_own"
  on public.sessions for delete
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

-- ---- visit_records (read-only for patients) ----
alter table public.visit_records enable row level security;

create policy "visit_records_select_own"
  on public.visit_records for select
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

-- ---- session_summaries (read-only for patients) ----
alter table public.session_summaries enable row level security;

create policy "session_summaries_select_own"
  on public.session_summaries for select
  using (
    patient_id in (
      select id from public.patients where user_id = auth.uid()
    )
  );

-- ---- doctors ----
alter table public.doctors enable row level security;

create policy "doctors_select_own"
  on public.doctors for select
  using (user_id = auth.uid());

-- ============================================================================
-- Storage: medical-documents bucket
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medical-documents',
  'medical-documents',
  false,
  52428800, -- 50 MB
  array['application/pdf']
)
on conflict (id) do nothing;

-- Storage RLS: users can manage their own folder (path = user_id/*)
create policy "storage_medical_documents_select"
  on storage.objects for select
  using (
    bucket_id = 'medical-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_medical_documents_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'medical-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_medical_documents_update"
  on storage.objects for update
  using (
    bucket_id = 'medical-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_medical_documents_delete"
  on storage.objects for delete
  using (
    bucket_id = 'medical-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
