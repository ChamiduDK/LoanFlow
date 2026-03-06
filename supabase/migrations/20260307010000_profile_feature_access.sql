alter table public.profiles
  add column if not exists feature_access jsonb not null default jsonb_build_object(
    'ai_chat', false,
    'new_application', false,
    'upload_documents', false,
    'track_application', false,
    'emi_calculator', false
  );

update public.profiles
set feature_access = jsonb_build_object(
  'ai_chat', false,
  'new_application', false,
  'upload_documents', false,
  'track_application', false,
  'emi_calculator', false
)
where feature_access is null;
