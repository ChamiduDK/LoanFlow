-- Secure delegated access for bank-agent decision and tracker updates.

create table if not exists public.bank_agent_access (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_token_hash text not null unique,
  pin_hash text not null,
  is_active boolean not null default true,
  expires_at timestamptz not null,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(access_token_hash) = 64),
  check (char_length(pin_hash) = 64)
);

create index if not exists idx_bank_agent_access_application_active
  on public.bank_agent_access (application_id, is_active, expires_at desc);

create index if not exists idx_bank_agent_access_user_created
  on public.bank_agent_access (user_id, created_at desc);

create trigger trg_bank_agent_access_updated_at before update on public.bank_agent_access
for each row execute function public.set_updated_at();

alter table public.bank_agent_access enable row level security;

drop policy if exists "bank_agent_access_service_role" on public.bank_agent_access;
create policy "bank_agent_access_service_role"
on public.bank_agent_access
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
