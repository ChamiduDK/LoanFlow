-- Add document availability tracking
-- Allows users to mark documents as "available" without uploading files

create table if not exists public.document_availability (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, document_type)
);

-- Enable RLS
alter table public.document_availability enable row level security;

-- Policies
create policy "Users can manage their own document availability"
  on public.document_availability
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trigger for updated_at
create trigger trg_document_availability_updated_at before update on public.document_availability
for each row execute function public.set_updated_at();

-- Add index
create index if not exists idx_document_availability_application on public.document_availability (application_id);
