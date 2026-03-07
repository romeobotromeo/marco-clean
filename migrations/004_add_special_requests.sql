-- Migration: Special requests log table
CREATE TABLE IF NOT EXISTS special_requests (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  request_type TEXT,
  details TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
