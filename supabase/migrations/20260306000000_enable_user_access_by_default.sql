-- Regular users should be able to access the app immediately after signup.
-- Keep the approval flag for manual suspension workflows, but stop blocking
-- every new account by default.

alter table public.profiles
  alter column is_approved set default true;

update public.profiles
set is_approved = true
where is_approved = false;
