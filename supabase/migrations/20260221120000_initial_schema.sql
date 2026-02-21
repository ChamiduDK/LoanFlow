-- Initial schema for SME LoanHub Supabase backend
-- Includes core loan modules, AI agent foundation tables, tracker support, and audit logging

create extension if not exists pgcrypto;

create type public.application_status as enum (
  'draft',
  'submitted',
  'evaluated',
  'applied',
  'under_review',
  'approved',
  'rejected',
  'withdrawn'
);

create type public.document_status as enum (
  'uploaded',
  'processing',
  'verified',
  'rejected',
  'needs_review'
);

create type public.outcome_status as enum (
  'applied',
  'under_review',
  'approved',
  'rejected'
);

create type public.installment_status as enum (
  'pending',
  'paid',
  'late'
);

create type public.channel_type as enum (
  'whatsapp',
  'email',
  'sms',
  'web'
);

create type public.chat_session_status as enum (
  'active',
  'closed',
  'archived'
);

create type public.chat_message_role as enum (
  'user',
  'assistant',
  'system',
  'tool'
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  phone text,
  district text,
  business_name text,
  business_type text,
  industry text,
  years_active integer check (years_active is null or years_active >= 0),
  annual_turnover numeric(14, 2) check (annual_turnover is null or annual_turnover >= 0),
  monthly_income numeric(14, 2) check (monthly_income is null or monthly_income >= 0),
  monthly_expenses numeric(14, 2) check (monthly_expenses is null or monthly_expenses >= 0),
  existing_loan_obligations numeric(14, 2) check (existing_loan_obligations is null or existing_loan_obligations >= 0),
  turnover_band text,
  is_admin boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  website text,
  contact_email text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_products (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.banks(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  purpose_category text,
  min_amount numeric(14, 2) not null check (min_amount >= 0),
  max_amount numeric(14, 2) not null check (max_amount >= min_amount),
  rate_min numeric(5, 2) not null check (rate_min >= 0),
  rate_max numeric(5, 2) not null check (rate_max >= rate_min),
  tenure_min_months integer not null check (tenure_min_months >= 1),
  tenure_max_months integer not null check (tenure_max_months >= tenure_min_months),
  collateral_required boolean not null default false,
  processing_days_min integer check (processing_days_min is null or processing_days_min >= 1),
  processing_days_max integer check (
    processing_days_max is null
    or processing_days_min is null
    or processing_days_max >= processing_days_min
  ),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_id, name)
);

create table if not exists public.loan_terms (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.loan_products(id) on delete cascade,
  term_label text not null,
  min_tenure_months integer not null check (min_tenure_months >= 1),
  max_tenure_months integer not null check (max_tenure_months >= min_tenure_months),
  interest_rate_min numeric(5, 2) not null check (interest_rate_min >= 0),
  interest_rate_max numeric(5, 2) not null check (interest_rate_max >= interest_rate_min),
  processing_fee_pct numeric(5, 2) check (processing_fee_pct is null or processing_fee_pct >= 0),
  late_fee_pct numeric(5, 2) check (late_fee_pct is null or late_fee_pct >= 0),
  prepayment_allowed boolean not null default true,
  extra_terms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.loan_products(id) on delete cascade,
  version integer not null default 1,
  rules_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.required_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.loan_products(id) on delete cascade,
  document_type text not null,
  display_name text not null,
  is_required boolean not null default true,
  notes text,
  accepted_formats text[] not null default array['pdf', 'jpg', 'png']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, document_type)
);

create table if not exists public.benefits (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.loan_products(id) on delete cascade,
  title text not null,
  description text,
  is_highlight boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collateral (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.loan_products(id) on delete cascade,
  collateral_type text not null,
  min_value_ratio numeric(8, 2) check (min_value_ratio is null or min_value_ratio >= 0),
  notes text,
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_amount numeric(14, 2) not null check (requested_amount > 0),
  purpose text not null,
  preferred_tenure_months integer not null check (preferred_tenure_months >= 1),
  collateral_available boolean not null default false,
  collateral_type text,
  status public.application_status not null default 'draft',
  profile_snapshot jsonb,
  business_context jsonb,
  selected_product_id uuid references public.loan_products(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_results (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  product_id uuid not null references public.loan_products(id) on delete cascade,
  bank_id uuid not null references public.banks(id) on delete cascade,
  eligibility_passed boolean not null,
  eligibility_score numeric(5, 2) not null check (eligibility_score >= 0 and eligibility_score <= 100),
  reasons_json jsonb not null default '[]'::jsonb,
  emi numeric(14, 2) not null check (emi >= 0),
  total_interest numeric(14, 2) not null check (total_interest >= 0),
  total_payable numeric(14, 2) not null check (total_payable >= 0),
  estimated_rate numeric(5, 2) not null check (estimated_rate >= 0),
  approval_probability numeric(5, 2) not null check (approval_probability >= 0 and approval_probability <= 100),
  document_completeness numeric(5, 2) not null check (document_completeness >= 0 and document_completeness <= 100),
  ranking_score numeric(8, 2) not null default 0,
  rank_position integer,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, product_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.loan_products(id) on delete set null,
  document_type text not null,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status public.document_status not null default 'uploaded',
  ocr_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_checks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  product_id uuid not null references public.loan_products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checklist_json jsonb not null default '[]'::jsonb,
  missing_docs jsonb not null default '[]'::jsonb,
  completeness_score numeric(5, 2) not null check (completeness_score >= 0 and completeness_score <= 100),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, product_id)
);

create table if not exists public.outcomes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.loan_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.outcome_status not null,
  applied_date date,
  decision_date date,
  approved_amount numeric(14, 2) check (approved_amount is null or approved_amount >= 0),
  approved_rate numeric(5, 2) check (approved_rate is null or approved_rate >= 0),
  approved_tenure_months integer check (approved_tenure_months is null or approved_tenure_months >= 1),
  consent_for_training boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  due_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  status public.installment_status not null default 'pending',
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_channel_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_type public.channel_type not null,
  channel_user_id text not null,
  is_verified boolean not null default false,
  linked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel_type)
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid references public.loan_applications(id) on delete set null,
  channel_link_id uuid references public.user_channel_links(id) on delete set null,
  status public.chat_session_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.chat_message_role not null,
  message_text text,
  message_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid references public.loan_applications(id) on delete set null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  action_status text not null default 'logged',
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  language text not null default 'en',
  notification_channel public.channel_type,
  reminder_frequency text not null default 'weekly',
  preference_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload_summary jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_is_admin on public.profiles (is_admin);
create index if not exists idx_banks_active on public.banks (is_active);
create index if not exists idx_loan_products_bank_active on public.loan_products (bank_id, is_active);
create index if not exists idx_loan_products_slug on public.loan_products (slug);
create index if not exists idx_loan_terms_product on public.loan_terms (product_id);
create index if not exists idx_eligibility_rules_product_active on public.eligibility_rules (product_id, is_active);
create index if not exists idx_required_documents_product on public.required_documents (product_id);
create index if not exists idx_benefits_product on public.benefits (product_id);
create index if not exists idx_collateral_product on public.collateral (product_id);
create index if not exists idx_loan_applications_user_created on public.loan_applications (user_id, created_at desc);
create index if not exists idx_loan_applications_status on public.loan_applications (status);
create index if not exists idx_application_results_application on public.application_results (application_id);
create index if not exists idx_application_results_rank on public.application_results (application_id, rank_position);
create index if not exists idx_documents_application_user on public.documents (application_id, user_id);
create index if not exists idx_document_checks_application on public.document_checks (application_id);
create index if not exists idx_outcomes_application on public.outcomes (application_id);
create index if not exists idx_installments_application_due on public.installments (application_id, due_date);
create index if not exists idx_chat_sessions_user on public.chat_sessions (user_id, started_at desc);
create index if not exists idx_chat_messages_session_created on public.chat_messages (session_id, created_at);
create index if not exists idx_agent_actions_user_created on public.agent_actions (user_id, created_at desc);
create index if not exists idx_audit_logs_actor_created on public.audit_logs (actor_user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_banks_updated_at before update on public.banks
for each row execute function public.set_updated_at();

create trigger trg_loan_products_updated_at before update on public.loan_products
for each row execute function public.set_updated_at();

create trigger trg_loan_terms_updated_at before update on public.loan_terms
for each row execute function public.set_updated_at();

create trigger trg_eligibility_rules_updated_at before update on public.eligibility_rules
for each row execute function public.set_updated_at();

create trigger trg_required_documents_updated_at before update on public.required_documents
for each row execute function public.set_updated_at();

create trigger trg_benefits_updated_at before update on public.benefits
for each row execute function public.set_updated_at();

create trigger trg_collateral_updated_at before update on public.collateral
for each row execute function public.set_updated_at();

create trigger trg_loan_applications_updated_at before update on public.loan_applications
for each row execute function public.set_updated_at();

create trigger trg_application_results_updated_at before update on public.application_results
for each row execute function public.set_updated_at();

create trigger trg_documents_updated_at before update on public.documents
for each row execute function public.set_updated_at();

create trigger trg_document_checks_updated_at before update on public.document_checks
for each row execute function public.set_updated_at();

create trigger trg_outcomes_updated_at before update on public.outcomes
for each row execute function public.set_updated_at();

create trigger trg_installments_updated_at before update on public.installments
for each row execute function public.set_updated_at();

create trigger trg_user_channel_links_updated_at before update on public.user_channel_links
for each row execute function public.set_updated_at();

create trigger trg_chat_sessions_updated_at before update on public.chat_sessions
for each row execute function public.set_updated_at();

create trigger trg_agent_preferences_updated_at before update on public.agent_preferences
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
