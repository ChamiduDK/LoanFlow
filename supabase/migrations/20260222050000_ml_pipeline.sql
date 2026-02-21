-- Deep learning loan approval pipeline storage
-- Stores anonymized training samples and model version metadata.

create table if not exists public.ml_training_samples (
  id uuid primary key default gen_random_uuid(),
  sample_key text not null unique,
  application_id uuid references public.loan_applications(id) on delete set null,
  product_id uuid references public.loan_products(id) on delete set null,
  outcome_status public.outcome_status not null,
  label smallint not null check (label in (0, 1)),
  feature_json jsonb not null default '{}'::jsonb,
  source_snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ml_training_samples_label on public.ml_training_samples (label);
create index if not exists idx_ml_training_samples_outcome_status on public.ml_training_samples (outcome_status);
create index if not exists idx_ml_training_samples_product on public.ml_training_samples (product_id);

create table if not exists public.ml_models (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  model_type text not null default 'tabular_mlp',
  framework text not null default 'tfjs',
  model_file_path text not null,
  preprocessing_file_path text not null,
  metrics_json jsonb not null default '{}'::jsonb,
  training_meta_json jsonb not null default '{}'::jsonb,
  trained_sample_count integer not null default 0 check (trained_sample_count >= 0),
  is_active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  trained_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_ml_models_single_active
on public.ml_models (is_active)
where is_active = true;

create index if not exists idx_ml_models_trained_at on public.ml_models (trained_at desc);
create index if not exists idx_ml_models_active on public.ml_models (is_active);

drop trigger if exists trg_ml_training_samples_updated_at on public.ml_training_samples;
create trigger trg_ml_training_samples_updated_at
before update on public.ml_training_samples
for each row execute function public.set_updated_at();

drop trigger if exists trg_ml_models_updated_at on public.ml_models;
create trigger trg_ml_models_updated_at
before update on public.ml_models
for each row execute function public.set_updated_at();

alter table public.ml_training_samples enable row level security;
alter table public.ml_models enable row level security;

-- Only admins should read/manage ML training samples.
drop policy if exists "ml_training_samples_admin_select" on public.ml_training_samples;
create policy "ml_training_samples_admin_select"
on public.ml_training_samples
for select
using (public.is_admin());

drop policy if exists "ml_training_samples_admin_insert" on public.ml_training_samples;
create policy "ml_training_samples_admin_insert"
on public.ml_training_samples
for insert
with check (public.is_admin());

drop policy if exists "ml_training_samples_admin_update" on public.ml_training_samples;
create policy "ml_training_samples_admin_update"
on public.ml_training_samples
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ml_training_samples_admin_delete" on public.ml_training_samples;
create policy "ml_training_samples_admin_delete"
on public.ml_training_samples
for delete
using (public.is_admin());

-- Only admins should read/manage ML model registry entries.
drop policy if exists "ml_models_admin_select" on public.ml_models;
create policy "ml_models_admin_select"
on public.ml_models
for select
using (public.is_admin());

drop policy if exists "ml_models_admin_insert" on public.ml_models;
create policy "ml_models_admin_insert"
on public.ml_models
for insert
with check (public.is_admin());

drop policy if exists "ml_models_admin_update" on public.ml_models;
create policy "ml_models_admin_update"
on public.ml_models
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ml_models_admin_delete" on public.ml_models;
create policy "ml_models_admin_delete"
on public.ml_models
for delete
using (public.is_admin());
