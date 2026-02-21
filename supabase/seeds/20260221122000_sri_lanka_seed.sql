-- Production baseline seed
-- This seed intentionally avoids demo/sample lender data.
-- Populate banks and schemes through admin APIs or controlled migration scripts per environment.

-- Optional: promote an existing authenticated user profile to admin.
-- update public.profiles set is_admin = true where email = 'admin@yourdomain.com';

-- Optional: insert audited production bank records via your release pipeline.
