-- Ensure live Supabase can support server-side upserts with onConflict: 'phone'.
-- Some existing projects may have been created before the current schema declared
-- these phone columns unique.

delete from public.runners a
using public.runners b
where a.phone = b.phone
  and a.id::text > b.id::text;

create unique index if not exists idx_runners_phone_unique
  on public.runners (phone);

create unique index if not exists idx_runner_applicants_phone_unique
  on public.runner_applicants (phone);

create unique index if not exists idx_users_phone_unique
  on public.users (phone);
