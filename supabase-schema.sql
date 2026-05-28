-- Supabase schema for Marco home-ops concierge
-- Run inside Supabase SQL editor or via psql against your Supabase database.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create table if not exists public.users (
  phone text primary key,
  role text,
  first_seen_at timestamptz default now(),
  last_active_at timestamptz default now(),
  last_category text,
  last_urgency text,
  conversation_reset_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_phone text references public.users(phone) on delete cascade,
  address text not null,
  address_fingerprint text not null,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_phone, address_fingerprint)
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  user_phone text references public.users(phone) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  category text,
  urgency text,
  summary text,
  notes text,
  needs jsonb default '{}'::jsonb,
  runner_interest boolean default false,
  property_address text,
  status text default 'new',
  created_at timestamptz default now(),
  archived_at timestamptz
);

create index if not exists idx_requests_user_phone on public.requests (user_phone);
create index if not exists idx_requests_status on public.requests (status);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_phone text references public.users(phone) on delete cascade,
  direction text check (direction in ('inbound', 'outbound')),
  body text,
  media_url text,
  raw_payload jsonb,
  created_at timestamptz default now(),
  archived_at timestamptz
);

create index if not exists idx_messages_user_phone_created_at
  on public.messages (user_phone, created_at);

create table if not exists public.runners (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  status text,
  last_contact_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.offer_room_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  phone text not null,
  brokerage text,
  market text,
  source text default 'offer-room-site',
  created_at timestamptz default now()
);

create unique index if not exists idx_offer_room_waitlist_email_phone
  on public.offer_room_waitlist (lower(email), phone);

create table if not exists public.runner_applicants (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text unique not null,
  email text,
  city text,
  neighborhood text,
  has_car boolean,
  phone_os text check (phone_os in ('iphone', 'android', 'other')),
  availability text,
  intro text,
  status text default 'applied',
  qualification_step text default 'awaiting-availability',
  qualification_responses jsonb default '{}'::jsonb,
  tags text[] default '{}',
  score integer,
  source text default 'runner-landing',
  calendly_url text,
  calendly_event_uri text,
  calendly_invitee_uri text,
  calendly_scheduled_at timestamptz,
  calendly_event_start timestamptz,
  calendly_event_end timestamptz,
  qualification_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.runner_applicant_notes (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references public.runner_applicants(id) on delete cascade,
  author text,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists idx_runner_applicants_status on public.runner_applicants (status);
create index if not exists idx_runner_applicants_updated_at on public.runner_applicants (updated_at desc);
create index if not exists idx_runner_applicant_notes_applicant on public.runner_applicant_notes (applicant_id);

alter table if exists public.runners
  add column if not exists applicant_id uuid references public.runner_applicants(id);

comment on table public.users is 'People texting Marco. phone is the primary identity.';
comment on table public.requests is 'Structured view of inbound needs from each conversation.';
comment on table public.messages is 'Every SMS interaction (inbound or outbound).';
comment on table public.offer_room_waitlist is 'Agent waitlist for Offer Room early access.';
comment on table public.runner_applicants is 'Inbound applications for Marco Runner roles.';
comment on table public.runner_applicant_notes is 'Internal notes attached to runner applicants.';

-- MARCO core learning/build engine.
-- Dry-run first: these tables do not send calls, texts, job posts, or recordings.

create table if not exists public.marco_signals (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text,
  actor_type text,
  actor_phone text,
  actor_email text,
  actor_name text,
  market text,
  raw_text text,
  summary text,
  ask_category text,
  urgency text,
  willingness_to_pay text,
  suggested_service text,
  status text default 'new',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_marco_signals_source_type on public.marco_signals (source_type);
create index if not exists idx_marco_signals_actor_phone on public.marco_signals (actor_phone);
create index if not exists idx_marco_signals_status_created_at on public.marco_signals (status, created_at desc);
create index if not exists idx_marco_signals_ask_category on public.marco_signals (ask_category);

create table if not exists public.demand_clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer_type text,
  category text,
  summary text,
  evidence_count integer default 0,
  sample_signal_ids uuid[] default '{}',
  markets text[] default '{}',
  estimated_price_cents integer,
  estimated_cost_cents integer,
  estimated_margin_cents integer,
  confidence numeric,
  status text default 'candidate',
  next_action text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_demand_clusters_status on public.demand_clusters (status);
create index if not exists idx_demand_clusters_category on public.demand_clusters (category);

create table if not exists public.marco_build_queue (
  id uuid primary key default gen_random_uuid(),
  demand_cluster_id uuid references public.demand_clusters(id) on delete set null,
  title text not null,
  build_type text,
  description text,
  priority text default 'normal',
  status text default 'queued',
  owner text,
  approval_required boolean default true,
  approval_reason text,
  economics_json jsonb default '{}'::jsonb,
  dry_run_status text default 'not_started',
  launched_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_marco_build_queue_status on public.marco_build_queue (status);
create index if not exists idx_marco_build_queue_priority on public.marco_build_queue (priority);

create table if not exists public.outreach_queue (
  id uuid primary key default gen_random_uuid(),
  audience_type text not null,
  contact_id text,
  channel text not null,
  provider text,
  message_or_script text not null,
  status text default 'draft',
  dry_run boolean default true,
  approval_status text default 'pending',
  estimated_cost_cents integer,
  scheduled_for timestamptz,
  sent_at timestamptz,
  outcome text,
  opt_out_detected boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_outreach_queue_audience_type on public.outreach_queue (audience_type);
create index if not exists idx_outreach_queue_status on public.outreach_queue (status);
create index if not exists idx_outreach_queue_approval_status on public.outreach_queue (approval_status);
create index if not exists idx_outreach_queue_dry_run on public.outreach_queue (dry_run);

create table if not exists public.gc_contacts (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  license_number text,
  license_status text,
  classification text,
  phone text,
  email text,
  website text,
  city text,
  county text,
  state text default 'CA',
  source_url text,
  source_type text,
  last_verified_at timestamptz,
  outreach_status text default 'not_queued',
  sms_opt_out boolean default false,
  call_opt_out boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_gc_contacts_license_unique
  on public.gc_contacts (license_number)
  where license_number is not null;

create index if not exists idx_gc_contacts_phone on public.gc_contacts (phone);
create index if not exists idx_gc_contacts_city on public.gc_contacts (city);
create index if not exists idx_gc_contacts_outreach_status on public.gc_contacts (outreach_status);

create table if not exists public.runner_video_interviews (
  id uuid primary key default gen_random_uuid(),
  runner_applicant_id uuid references public.runner_applicants(id) on delete cascade,
  provider text,
  recording_url text,
  transcript text,
  consent_captured boolean default false,
  score_json jsonb default '{}'::jsonb,
  recommendation text,
  reviewer_status text default 'not_reviewed',
  created_at timestamptz default now()
);

create index if not exists idx_runner_video_interviews_applicant
  on public.runner_video_interviews (runner_applicant_id);

create index if not exists idx_runner_video_interviews_recommendation
  on public.runner_video_interviews (recommendation);

create table if not exists public.economics_estimates (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text,
  revenue_model text,
  expected_price_cents integer,
  expected_cost_cents integer,
  expected_margin_cents integer,
  expected_conversion_rate numeric,
  expected_volume integer,
  capacity_required text,
  risk_level text,
  recommendation text,
  approval_needed boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_economics_estimates_target
  on public.economics_estimates (target_type, target_id);

create index if not exists idx_economics_estimates_approval_needed
  on public.economics_estimates (approval_needed);

-- MARCO runner app, tasking, and Founder Runner points ledger.
-- Legal note: points are an internal tracking mechanism, not issued equity.

create table if not exists public.runner_profiles (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references public.runner_applicants(id) on delete set null,
  runner_id uuid references public.runners(id) on delete set null,
  phone text unique not null,
  display_name text,
  city text,
  county text,
  state text default 'CA',
  home_zone text,
  status text default 'onboarding',
  trust_level text default 'new',
  founder_runner_unlocked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_runner_profiles_status on public.runner_profiles (status);
create index if not exists idx_runner_profiles_city on public.runner_profiles (city);

create table if not exists public.runner_availability (
  id uuid primary key default gen_random_uuid(),
  runner_profile_id uuid references public.runner_profiles(id) on delete cascade,
  status text not null default 'offline',
  zone text,
  available_from timestamptz,
  available_until timestamptz,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_runner_availability_runner on public.runner_availability (runner_profile_id);
create index if not exists idx_runner_availability_status_zone on public.runner_availability (status, zone);

create table if not exists public.runner_tasks (
  id uuid primary key default gen_random_uuid(),
  runner_profile_id uuid references public.runner_profiles(id) on delete set null,
  request_id uuid references public.requests(id) on delete set null,
  title text not null,
  task_type text,
  status text default 'draft',
  market text,
  address text,
  scheduled_for timestamptz,
  payout_cents integer,
  points_award integer default 0,
  checklist_json jsonb default '[]'::jsonb,
  instructions text,
  proof_required text[] default '{}',
  accepted_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_runner_tasks_runner on public.runner_tasks (runner_profile_id);
create index if not exists idx_runner_tasks_status on public.runner_tasks (status);
create index if not exists idx_runner_tasks_market on public.runner_tasks (market);

create table if not exists public.runner_task_events (
  id uuid primary key default gen_random_uuid(),
  runner_task_id uuid references public.runner_tasks(id) on delete cascade,
  runner_profile_id uuid references public.runner_profiles(id) on delete set null,
  event_type text not null,
  note text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_runner_task_events_task on public.runner_task_events (runner_task_id);

create table if not exists public.runner_task_media (
  id uuid primary key default gen_random_uuid(),
  runner_task_id uuid references public.runner_tasks(id) on delete cascade,
  runner_profile_id uuid references public.runner_profiles(id) on delete set null,
  media_url text not null,
  media_type text,
  caption text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_runner_task_media_task on public.runner_task_media (runner_task_id);

create table if not exists public.runner_points_ledger (
  id uuid primary key default gen_random_uuid(),
  runner_profile_id uuid references public.runner_profiles(id) on delete cascade,
  runner_task_id uuid references public.runner_tasks(id) on delete set null,
  event_type text not null,
  points integer not null,
  description text,
  legal_status text default 'internal_points_not_equity',
  created_at timestamptz default now()
);

create index if not exists idx_runner_points_ledger_runner on public.runner_points_ledger (runner_profile_id);
create index if not exists idx_runner_points_ledger_event on public.runner_points_ledger (event_type);

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
