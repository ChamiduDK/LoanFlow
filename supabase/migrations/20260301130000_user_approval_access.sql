-- Add a dedicated account approval flag.
-- Regular users must be approved by admin before accessing protected user workflows.

alter table public.profiles
  add column if not exists is_approved boolean not null default false;

create index if not exists idx_profiles_is_approved on public.profiles (is_approved);

-- Preserve current access for existing accounts and ensure admins are never blocked.
update public.profiles
set is_approved = true
where is_approved = false;
