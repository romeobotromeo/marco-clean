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

