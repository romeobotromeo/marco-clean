-- Migration: Add cloudflare_delete_at column for deferred Cloudflare cleanup
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cloudflare_delete_at TIMESTAMPTZ;
