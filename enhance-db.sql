-- MARCO CLEAN DATABASE ENHANCEMENT - Phase 1
-- Adding sophisticated conversation system support
-- Date: 2026-02-23

-- Enhance customers table with conversation fields
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS services TEXT[],
ADD COLUMN IF NOT EXISTS conversation_state VARCHAR(50) DEFAULT 'greeting',
ADD COLUMN IF NOT EXISTS style_preference TEXT,
ADD COLUMN IF NOT EXISTS business_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS site_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_conversation_state ON customers(conversation_state);
CREATE INDEX IF NOT EXISTS idx_customers_updated ON customers(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_phone_time ON messages(phone, created_at DESC);

-- Add update trigger for customers
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_customers_modtime ON customers;
CREATE TRIGGER update_customers_modtime BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_modified_column();