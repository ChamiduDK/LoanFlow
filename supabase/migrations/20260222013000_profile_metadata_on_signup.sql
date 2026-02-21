-- Preserve signup metadata in profile rows when a user account is created.
-- This helps when email confirmation is required and no immediate session exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_full_name text;
  user_phone text;
begin
  user_full_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  user_phone := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');

  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email, user_full_name, user_phone)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, profiles.full_name),
        phone = coalesce(excluded.phone, profiles.phone),
        updated_at = now();

  return new;
end;
$$;
