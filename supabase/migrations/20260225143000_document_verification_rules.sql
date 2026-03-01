-- Add structured verification rules per required document.
alter table public.required_documents
  add column if not exists verification_rules_json jsonb not null default '{}'::jsonb;

comment on column public.required_documents.verification_rules_json is
  'Structured document verification rules used by OCR + AI scan (required/forbidden keywords, min OCR text length, AI instructions).';
