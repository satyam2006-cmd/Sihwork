-- Add scribe mode support for clinic visit sessions

-- 1. Update sessions mode constraint to allow 'scribe'
ALTER TABLE sessions DROP CONSTRAINT sessions_mode_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check CHECK (mode IN ('text', 'voice', 'scribe'));

-- 2. Add doctor_id to sessions (nullable — only set for scribe sessions)
ALTER TABLE sessions ADD COLUMN doctor_id uuid REFERENCES doctors(id);
CREATE INDEX idx_sessions_doctor_id ON sessions(doctor_id);

-- 3. Update EHR entries encounter type to allow 'in_person_visit'
ALTER TABLE ehr_entries DROP CONSTRAINT ehr_entries_encounter_type_check;
ALTER TABLE ehr_entries ADD CONSTRAINT ehr_entries_encounter_type_check
  CHECK (encounter_type IN ('virtual_consultation', 'follow_up', 'urgent', 'emergency', 'in_person_visit'));
