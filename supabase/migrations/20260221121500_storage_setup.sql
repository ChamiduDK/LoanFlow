-- Supabase storage setup for private loan document uploads

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'loan-documents',
  'loan-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Users can only read their own files under path format: {user_id}/{application_id}/...
drop policy if exists "documents_bucket_select_own" on storage.objects;
create policy "documents_bucket_select_own"
on storage.objects
for select
using (
  bucket_id = 'loan-documents'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Users can upload only inside their own user-scoped folder.
drop policy if exists "documents_bucket_insert_own" on storage.objects;
create policy "documents_bucket_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'loan-documents'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Users can update only objects they own.
drop policy if exists "documents_bucket_update_own" on storage.objects;
create policy "documents_bucket_update_own"
on storage.objects
for update
using (
  bucket_id = 'loan-documents'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'loan-documents'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Users can delete only objects they own.
drop policy if exists "documents_bucket_delete_own" on storage.objects;
create policy "documents_bucket_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'loan-documents'
  and split_part(name, '/', 1) = auth.uid()::text
);
