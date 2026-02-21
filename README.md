# SME LoanHub

Sri Lankan SME Loan Recommendation and Approval Prediction platform.

## Project Structure

- `src/` React frontend (API-backed, no mock/demo data)
- `server/` in-project TypeScript backend API layer
- `supabase/migrations/` schema + RLS + storage SQL migrations
- `supabase/seeds/` production baseline seed scripts (no demo inserts)
- `types/` shared API/domain TypeScript types
- `src/lib/supabase/` frontend Supabase client helpers

## Environment

Copy `.env.example` to `.env` and configure:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DOCS_BUCKET`
- `API_PORT`
- `CORS_ORIGIN`
- `NODE_ENV`
- `AGENT_WEBHOOK_SECRET` (required for signed agent webhook validation)

## Backend Commands

- `npm run server:dev` start backend in watch mode
- `npm run server:start` start backend once
- `npm run typecheck:server` type-check backend

Frontend commands are unchanged (`npm run dev`, `npm run build`, etc.).

## Supabase SQL Delivery

Apply migrations in order:

1. `supabase/migrations/20260221120000_initial_schema.sql`
2. `supabase/migrations/20260221121000_rls_policies.sql`
3. `supabase/migrations/20260221121500_storage_setup.sql`

Then apply baseline seed script:

- `supabase/seeds/20260221122000_sri_lanka_seed.sql`

## API Surface (Implemented)

- Auth/Profile:
  - `POST /api/auth/signup`
  - `POST /api/auth/signin`
  - `POST /api/auth/signout`
  - `GET /api/me`
  - `PUT /api/profile`
- Banks and schemes:
  - `GET /api/banks`
  - `GET /api/banks/:id/products`
  - `GET /api/loan-products/:id`
- Admin:
  - `POST /api/admin/banks`
  - `PUT /api/admin/banks/:id`
  - `DELETE /api/admin/banks/:id`
  - `POST /api/admin/loan-products`
  - `PUT /api/admin/loan-products/:id`
  - `DELETE /api/admin/loan-products/:id`
  - `PUT /api/admin/loan-terms/:productId`
  - `PUT /api/admin/eligibility-rules/:productId`
  - `PUT /api/admin/required-documents/:productId`
  - `PUT /api/admin/benefits/:productId`
  - `PUT /api/admin/collateral/:productId`
- Applications:
  - `POST /api/applications`
  - `GET /api/applications`
  - `GET /api/applications/:id`
  - `PUT /api/applications/:id`
  - `POST /api/applications/:id/evaluate`
  - `GET /api/applications/:id/evaluation`
- Documents:
  - `POST /api/applications/:id/documents/upload`
  - `GET /api/applications/:id/documents`
  - `POST /api/applications/:id/documents/check`
- Outcomes + tracker:
  - `POST /api/applications/:id/outcome`
  - `GET /api/applications/:id/outcome`
  - `GET /api/applications/:id/tracker`
  - `POST /api/applications/:id/tracker/installments`
  - `GET /api/applications/:id/tracker/installments`
- Calculator:
  - `POST /api/calculator/emi`
- Agent foundation:
  - `POST /api/agent/link-whatsapp`
  - `POST /api/agent/chat/webhook`
  - `GET /api/agent/context/:applicationId`
  - `POST /api/agent/actions/log`
