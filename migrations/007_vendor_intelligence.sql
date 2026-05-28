-- Migration for Vendor Intelligence MVP

-- Create vendors table
CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_name text,
  primary_phone text,
  primary_email text,
  website text,
  source_url text,
  source_name text,
  trade_categories text[] DEFAULT '{}',
  service_areas text[] DEFAULT '{}',
  license_number text,
  license_status text,
  insurance_status text,
  rating numeric,
  review_count integer,
  status text DEFAULT 'discovered',
  reliability_score integer DEFAULT 0,
  responsiveness_score integer DEFAULT 0,
  quality_score integer DEFAULT 0,
  billing_score integer DEFAULT 0,
  notes text,
  last_contact_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for vendors table
CREATE INDEX ON vendors USING gin(trade_categories);
CREATE INDEX ON vendors USING gin(service_areas);
CREATE INDEX ON vendors(status);
CREATE INDEX ON vendors(primary_phone);

-- Create vendor_contact_events table
CREATE TABLE vendor_contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  request_id uuid REFERENCES requests(id) ON DELETE SET NULL,
  channel text,
  direction text,
  status text,
  summary text,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  contacted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes for vendor_contact_events table
CREATE INDEX ON vendor_contact_events(vendor_id);
CREATE INDEX ON vendor_contact_events(request_id);
CREATE INDEX ON vendor_contact_events(status);
CREATE INDEX ON vendor_contact_events(contacted_at DESC);

-- Create vendor_outreach_queue table
CREATE TABLE vendor_outreach_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES requests(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  rank integer DEFAULT 0,
  reason text,
  status text DEFAULT 'queued',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint for vendor_outreach_queue
ALTER TABLE vendor_outreach_queue ADD CONSTRAINT unique_request_vendor UNIQUE (request_id, vendor_id);

-- Create journeymen table
CREATE TABLE journeymen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  email text,
  trade_categories text[] DEFAULT '{}',
  service_areas text[] DEFAULT '{}',
  license_number text,
  status text DEFAULT 'candidate',
  review_rate_cents integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create expert_reviews table
CREATE TABLE expert_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES requests(id) ON DELETE CASCADE,
  journeyman_id uuid REFERENCES journeymen(id) ON DELETE SET NULL,
  status text DEFAULT 'needed',
  question text,
  recommendation text,
  risk_level text,
  requires_licensed_trade boolean,
  suggested_trade text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create trade_talent_leads table
CREATE TABLE trade_talent_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  email text,
  trade_interest text[] DEFAULT '{}',
  school_or_program text,
  city text,
  service_areas text[] DEFAULT '{}',
  availability text,
  status text DEFAULT 'lead',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create vendor_talent_alerts table
CREATE TABLE vendor_talent_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  trade_categories text[] DEFAULT '{}',
  service_areas text[] DEFAULT '{}',
  wants_job_alerts boolean DEFAULT false,
  wants_talent_alerts boolean DEFAULT false,
  preferred_contact_channel text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);