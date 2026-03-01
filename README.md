# LoanFlow

LoanFlow is a Sri Lankan SME loan recommendation and approval prediction platform.

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
- `ML_ASSETS_DIR` (filesystem path for trained ML model artifacts)
- `OCR_PROVIDER` (`placeholder`, `tesseract`, `azure_document_intelligence`, or `google_vision`)
- Tesseract OCR settings (used when `OCR_PROVIDER=tesseract`):
  - `OCR_TESSERACT_COMMAND` (default `tesseract`)
  - `TESSDATA_PREFIX` (optional; set when language files are not detected, e.g. `...\tessdata`)
  - `OCR_TESSERACT_LANGUAGE` (default `eng`)
  - `OCR_TESSERACT_PSM` (default `3`)
  - `OCR_TESSERACT_OEM` (default `1`)
  - `OCR_TESSERACT_TIMEOUT_MS`
  - `OCR_PDFTOPPM_COMMAND` (default `pdftoppm`, for PDF pages -> images)
  - `OCR_PDF_DPI` (default `200`)
  - `OCR_PDF_MAX_PAGES` (default `10`)
- Azure OCR settings (required when `OCR_PROVIDER=azure_document_intelligence`):
  - `OCR_AZURE_ENDPOINT`
  - `OCR_AZURE_API_KEY`
  - `OCR_AZURE_API_VERSION` (default `2024-11-30`)
  - `OCR_AZURE_MODEL_ID` (default `prebuilt-read`)
  - `OCR_AZURE_LOCALE` (optional)
  - `OCR_AZURE_POLL_INTERVAL_MS`
  - `OCR_AZURE_POLL_TIMEOUT_MS`
  - `OCR_AZURE_REQUEST_TIMEOUT_MS`
- Google OCR settings (required when `OCR_PROVIDER=google_vision`):
  - `OCR_GOOGLE_API_KEY` (Cloud Vision API key, usually starts with `AIza`)
  - `OCR_GOOGLE_ENDPOINT` (default `https://vision.googleapis.com/v1`)
  - `OCR_GOOGLE_REQUEST_TIMEOUT_MS`
  - PDF scans with Google OCR still require `OCR_PDFTOPPM_COMMAND` (`pdftoppm`) to convert pages to images first.
- Optional AI-assisted document verification with Gemini (runs after OCR):
  - `DOCUMENT_AI_PROVIDER` (`disabled` or `gemini`)
  - `DOCUMENT_AI_GEMINI_API_KEY` (required when provider is `gemini`)
  - `DOCUMENT_AI_GEMINI_MODEL` (default `gemini-2.0-flash-lite`)
  - `DOCUMENT_AI_TIMEOUT_MS` (default `20000`)
  - `DOCUMENT_AI_MIN_OCR_CHARS` (default `120`)
  - `DOCUMENT_AI_MAX_TEXT_CHARS` (default `6000`)
  - Used for document type detection and rule-based verification status (`valid` / `invalid` / `unclear`)
- Admin document verification rules (`required_documents.verification_rules_json`):
  - `required_keywords`: string array that must appear in OCR text
  - `forbidden_keywords`: string array that must not appear
  - `min_text_length`: minimum OCR character count
  - `ai_instructions`: optional extra Gemini instruction for edge cases

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
4. `supabase/migrations/20260222013000_profile_metadata_on_signup.sql`
5. `supabase/migrations/20260222030000_tracking_final_verification.sql`
6. `supabase/migrations/20260222050000_ml_pipeline.sql`
7. `supabase/migrations/20260225143000_document_verification_rules.sql`
8. `supabase/migrations/20260301130000_user_approval_access.sql`

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
  - `GET /api/admin/overview`
  - `GET /api/admin/users`
  - `PUT /api/admin/users/:id/role`
  - `PUT /api/admin/users/:id/approval`
  - `GET /api/admin/applications`
  - `PUT /api/admin/applications/:id/decision`
  - `GET /api/admin/audit-logs`
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
  - `POST /api/applications/:id/track`
  - `POST /api/applications/:id/proposal/generate`
  - `GET /api/applications/:id/proposal`
  - `GET /api/applications/:id/loan-management`
- Documents:
  - `POST /api/applications/:id/documents/upload`
  - `GET /api/applications/:id/documents`
  - `POST /api/applications/:id/documents/check`
  - `POST /api/applications/:id/documents/scan`
- Outcomes + tracker:
  - `POST /api/applications/:id/outcome`
  - `GET /api/applications/:id/outcome`
  - `GET /api/applications/:id/tracker`
  - `POST /api/applications/:id/tracker/re-evaluate`
  - `POST /api/applications/:id/tracker/installments`
  - `GET /api/applications/:id/tracker/installments`
- Calculator:
  - `POST /api/calculator/emi`
- ML:
  - `POST /api/ml/train` (admin)
  - `GET /api/ml/models` (admin)
  - `POST /api/ml/activate-model/:modelId` (admin)
  - `POST /api/ml/predict`
- Agent foundation:
  - `GET /api/agent/chat/session`
  - `POST /api/agent/chat/session`
  - `POST /api/agent/chat/message`
  - `POST /api/agent/link-whatsapp`
  - `POST /api/agent/chat/webhook`
  - `GET /api/agent/context/:applicationId`
  - `POST /api/agent/actions/log`
