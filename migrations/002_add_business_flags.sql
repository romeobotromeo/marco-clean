-- Migration: Add is_personal and is_existing flags to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_existing BOOLEAN DEFAULT FALSE;
