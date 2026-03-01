-- Migration: Add site_subdomain and site_html columns to conversations table
-- These columns store the site's subdomain and full HTML so the active handler
-- can retrieve and update them for live site editing.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS site_subdomain TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS site_html TEXT;
