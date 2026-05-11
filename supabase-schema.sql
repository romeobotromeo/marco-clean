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