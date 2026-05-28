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

