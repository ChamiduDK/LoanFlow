-- Bank-specific tracking and final verification enhancements

alter table public.loan_applications
  add column if not exists tracking_started_at timestamptz;

alter table public.application_results
  add column if not exists initial_probability numeric(5, 2);

alter table public.application_results
  add column if not exists final_probability numeric(5, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'application_results_initial_probability_check'
  ) then
    alter table public.application_results
      add constraint application_results_initial_probability_check
      check (initial_probability is null or (initial_probability >= 0 and initial_probability <= 100));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'application_results_final_probability_check'
  ) then
    alter table public.application_results
      add constraint application_results_final_probability_check
      check (final_probability is null or (final_probability >= 0 and final_probability <= 100));
  end if;
end;
$$;

update public.application_results
set initial_probability = approval_probability
where initial_probability is null;

alter table public.documents
  add column if not exists detected_doc_type text;

alter table public.documents
  add column if not exists ocr_text text;

alter table public.documents
  add column if not exists extracted_json jsonb not null default '{}'::jsonb;

alter table public.documents
  add column if not exists validation_status text not null default 'unclear';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_validation_status_check'
  ) then
    alter table public.documents
      add constraint documents_validation_status_check
      check (validation_status in ('valid', 'invalid', 'unclear'));
  end if;
end;
$$;

alter table public.document_checks
  add column if not exists validation_notes_json jsonb not null default '[]'::jsonb;

create table if not exists public.loan_proposals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  product_id uuid not null references public.loan_products(id) on delete cascade,
  proposal_version integer not null default 1,
  proposal_data_json jsonb not null default '{}'::jsonb,
  html_content text,
  pdf_file_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, product_id, proposal_version)
);

create index if not exists idx_loan_applications_tracking_started on public.loan_applications (tracking_started_at);
create index if not exists idx_application_results_initial_probability on public.application_results (initial_probability);
create index if not exists idx_application_results_final_probability on public.application_results (final_probability);
create index if not exists idx_documents_validation_status on public.documents (validation_status);
create index if not exists idx_loan_proposals_application_product on public.loan_proposals (application_id, product_id, created_at desc);

drop trigger if exists trg_loan_proposals_updated_at on public.loan_proposals;
create trigger trg_loan_proposals_updated_at
before update on public.loan_proposals
for each row execute function public.set_updated_at();

alter table public.loan_proposals enable row level security;

drop policy if exists "loan_proposals_select_owner" on public.loan_proposals;
create policy "loan_proposals_select_owner"
on public.loan_proposals
for select
using (public.owns_application(application_id) or public.is_admin());

drop policy if exists "loan_proposals_insert_owner" on public.loan_proposals;
create policy "loan_proposals_insert_owner"
on public.loan_proposals
for insert
with check (public.owns_application(application_id) or public.is_admin());

drop policy if exists "loan_proposals_update_owner" on public.loan_proposals;
create policy "loan_proposals_update_owner"
on public.loan_proposals
for update
using (public.owns_application(application_id) or public.is_admin())
with check (public.owns_application(application_id) or public.is_admin());

drop policy if exists "loan_proposals_delete_owner" on public.loan_proposals;
create policy "loan_proposals_delete_owner"
on public.loan_proposals
for delete
using (public.owns_application(application_id) or public.is_admin());
