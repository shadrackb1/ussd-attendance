-- ============================================
-- USSD Attendance System - Schema
-- ============================================

CREATE TABLE IF NOT EXISTS lecturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    lecturer_id UUID NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    student_id VARCHAR(50) NOT NULL UNIQUE,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    session_code VARCHAR(6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Unique constraint: only one active session per unit at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_code
    ON sessions(unit_id)
    WHERE is_active = TRUE;

-- Index for USSD lookups
CREATE INDEX IF NOT EXISTS idx_sessions_session_code
    ON sessions(session_code);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    signed_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_session_id
    ON attendance_records(session_id);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id
    ON attendance_records(student_id);
