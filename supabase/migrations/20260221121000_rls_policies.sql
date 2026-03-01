-- Row Level Security policies for LoanFlow Supabase schema
-- User-owned data is restricted to auth.uid(); reference data is public-read with admin writes.

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_admin = true
  );
$$;

create or replace function public.owns_application(p_application_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.loan_applications la
    where la.id = p_application_id
      and la.user_id = p_user_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.banks enable row level security;
alter table public.loan_products enable row level security;
alter table public.loan_terms enable row level security;
alter table public.eligibility_rules enable row level security;
alter table public.required_documents enable row level security;
alter table public.benefits enable row level security;
alter table public.collateral enable row level security;
alter table public.loan_applications enable row level security;
alter table public.application_results enable row level security;
alter table public.documents enable row level security;
alter table public.document_checks enable row level security;
alter table public.outcomes enable row level security;
alter table public.installments enable row level security;
alter table public.user_channel_links enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.agent_actions enable row level security;
alter table public.agent_preferences enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users manage only their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- Admin-managed bank and scheme config: public read, admin write.
drop policy if exists "banks_public_read" on public.banks;
create policy "banks_public_read"
on public.banks
for select
using (is_active = true or public.is_admin());

drop policy if exists "banks_admin_insert" on public.banks;
create policy "banks_admin_insert"
on public.banks
for insert
with check (public.is_admin());

drop policy if exists "banks_admin_update" on public.banks;
create policy "banks_admin_update"
on public.banks
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "banks_admin_delete" on public.banks;
create policy "banks_admin_delete"
on public.banks
for delete
using (public.is_admin());

drop policy if exists "loan_products_public_read" on public.loan_products;
create policy "loan_products_public_read"
on public.loan_products
for select
using (is_active = true or public.is_admin());

drop policy if exists "loan_products_admin_insert" on public.loan_products;
create policy "loan_products_admin_insert"
on public.loan_products
for insert
with check (public.is_admin());

drop policy if exists "loan_products_admin_update" on public.loan_products;
create policy "loan_products_admin_update"
on public.loan_products
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "loan_products_admin_delete" on public.loan_products;
create policy "loan_products_admin_delete"
on public.loan_products
for delete
using (public.is_admin());

drop policy if exists "loan_terms_public_read" on public.loan_terms;
create policy "loan_terms_public_read"
on public.loan_terms
for select
using (
  exists (
    select 1
    from public.loan_products lp
    where lp.id = loan_terms.product_id
      and (lp.is_active = true or public.is_admin())
  )
);

drop policy if exists "loan_terms_admin_write" on public.loan_terms;
create policy "loan_terms_admin_write"
on public.loan_terms
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "eligibility_rules_public_read" on public.eligibility_rules;
create policy "eligibility_rules_public_read"
on public.eligibility_rules
for select
using (
  exists (
    select 1
    from public.loan_products lp
    where lp.id = eligibility_rules.product_id
      and (lp.is_active = true or public.is_admin())
  )
);

drop policy if exists "eligibility_rules_admin_write" on public.eligibility_rules;
create policy "eligibility_rules_admin_write"
on public.eligibility_rules
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "required_documents_public_read" on public.required_documents;
create policy "required_documents_public_read"
on public.required_documents
for select
using (
  exists (
    select 1
    from public.loan_products lp
    where lp.id = required_documents.product_id
      and (lp.is_active = true or public.is_admin())
  )
);

drop policy if exists "required_documents_admin_write" on public.required_documents;
create policy "required_documents_admin_write"
on public.required_documents
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "benefits_public_read" on public.benefits;
create policy "benefits_public_read"
on public.benefits
for select
using (
  exists (
    select 1
    from public.loan_products lp
    where lp.id = benefits.product_id
      and (lp.is_active = true or public.is_admin())
  )
);

drop policy if exists "benefits_admin_write" on public.benefits;
create policy "benefits_admin_write"
on public.benefits
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "collateral_public_read" on public.collateral;
create policy "collateral_public_read"
on public.collateral
for select
using (
  exists (
    select 1
    from public.loan_products lp
    where lp.id = collateral.product_id
      and (lp.is_active = true or public.is_admin())
  )
);

drop policy if exists "collateral_admin_write" on public.collateral;
create policy "collateral_admin_write"
on public.collateral
for all
using (public.is_admin())
with check (public.is_admin());

-- Loan applications: users own and manage only their own records.
drop policy if exists "loan_applications_select_own" on public.loan_applications;
create policy "loan_applications_select_own"
on public.loan_applications
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "loan_applications_insert_own" on public.loan_applications;
create policy "loan_applications_insert_own"
on public.loan_applications
for insert
with check (user_id = auth.uid());

drop policy if exists "loan_applications_update_own" on public.loan_applications;
create policy "loan_applications_update_own"
on public.loan_applications
for update
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "loan_applications_delete_own" on public.loan_applications;
create policy "loan_applications_delete_own"
on public.loan_applications
for delete
using (user_id = auth.uid() or public.is_admin());

-- Application results: users can only read results for their own applications.
drop policy if exists "application_results_select_owner" on public.application_results;
create policy "application_results_select_owner"
on public.application_results
for select
using (public.owns_application(application_id) or public.is_admin());

drop policy if exists "application_results_insert_owner" on public.application_results;
create policy "application_results_insert_owner"
on public.application_results
for insert
with check (public.owns_application(application_id) or public.is_admin());

drop policy if exists "application_results_update_owner" on public.application_results;
create policy "application_results_update_owner"
on public.application_results
for update
using (public.owns_application(application_id) or public.is_admin())
with check (public.owns_application(application_id) or public.is_admin());

-- Documents and checks: users can manage only their own application documents.
drop policy if exists "documents_select_owner" on public.documents;
create policy "documents_select_owner"
on public.documents
for select
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "documents_insert_owner" on public.documents;
create policy "documents_insert_owner"
on public.documents
for insert
with check (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "documents_update_owner" on public.documents;
create policy "documents_update_owner"
on public.documents
for update
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin())
with check (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "documents_delete_owner" on public.documents;
create policy "documents_delete_owner"
on public.documents
for delete
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "document_checks_select_owner" on public.document_checks;
create policy "document_checks_select_owner"
on public.document_checks
for select
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "document_checks_insert_owner" on public.document_checks;
create policy "document_checks_insert_owner"
on public.document_checks
for insert
with check (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "document_checks_update_owner" on public.document_checks;
create policy "document_checks_update_owner"
on public.document_checks
for update
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin())
with check (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

-- Outcomes and installments: users access only their own tracker and feedback rows.
drop policy if exists "outcomes_select_owner" on public.outcomes;
create policy "outcomes_select_owner"
on public.outcomes
for select
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "outcomes_insert_owner" on public.outcomes;
create policy "outcomes_insert_owner"
on public.outcomes
for insert
with check (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "outcomes_update_owner" on public.outcomes;
create policy "outcomes_update_owner"
on public.outcomes
for update
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin())
with check (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "installments_select_owner" on public.installments;
create policy "installments_select_owner"
on public.installments
for select
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "installments_insert_owner" on public.installments;
create policy "installments_insert_owner"
on public.installments
for insert
with check (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

drop policy if exists "installments_update_owner" on public.installments;
create policy "installments_update_owner"
on public.installments
for update
using (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin())
with check (user_id = auth.uid() and public.owns_application(application_id) or public.is_admin());

-- Agent-linked user data: restrict rows to owner.
drop policy if exists "user_channel_links_owner" on public.user_channel_links;
create policy "user_channel_links_owner"
on public.user_channel_links
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "chat_sessions_owner" on public.chat_sessions;
create policy "chat_sessions_owner"
on public.chat_sessions
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "chat_messages_owner" on public.chat_messages;
create policy "chat_messages_owner"
on public.chat_messages
for all
using (user_id = auth.uid() or public.is_admin())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and cs.user_id = auth.uid()
  )
  or public.is_admin()
);

drop policy if exists "agent_actions_owner" on public.agent_actions;
create policy "agent_actions_owner"
on public.agent_actions
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "agent_preferences_owner" on public.agent_preferences;
create policy "agent_preferences_owner"
on public.agent_preferences
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- Audit logs: admins can read; authenticated users may create logs for their own actions.
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
on public.audit_logs
for select
using (public.is_admin());

drop policy if exists "audit_logs_insert_actor" on public.audit_logs;
create policy "audit_logs_insert_actor"
on public.audit_logs
for insert
with check (
  auth.role() = 'service_role'
  or actor_user_id = auth.uid()
  or public.is_admin()
);
