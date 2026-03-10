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
- `APP_BASE_URL` (public frontend origin used in generated links)
- `NODE_ENV`
- `AGENT_WEBHOOK_SECRET` (required for signed agent webhook validation)
- `ML_ASSETS_DIR` (filesystem path for trained ML model artifacts)
- `ML_ALLOW_SYNTHETIC_BOOTSTRAP` (optional; defaults to enabled outside production and disabled in production. When enabled, local/demo ML training can include synthetic bootstrap outcomes. Production ML still requires consented real outcomes.)
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
  - `DOCUMENT_AI_GEMINI_MODEL` (default `gemini-2.5-flash`)
  - `DOCUMENT_AI_TIMEOUT_MS` (default `20000`)
  - `DOCUMENT_AI_MIN_OCR_CHARS` (default `120`)
  - `DOCUMENT_AI_MAX_TEXT_CHARS` (default `6000`)
  - Used for document type detection and rule-based verification status (`valid` / `invalid` / `unclear`)
- Telegram bot channel:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_BOT_USERNAME` (optional)
  - `TELEGRAM_AUTO_START` (`true`/`false`, default `true`)
  - `TELEGRAM_POLL_INTERVAL_MS` (default `2000`)
- Admin document verification rules (`required_documents.verification_rules_json`):
  - `required_keywords`: string array that must appear in OCR text
  - `forbidden_keywords`: string array that must not appear
  - `min_text_length`: minimum OCR character count
  - `ai_instructions`: optional extra Gemini instruction for edge cases
- WhatsApp transport:
  - `WHATSAPP_PROVIDER` (`whatsapp_web`, `twilio`, or `disabled`)
  - `WHATSAPP_WEB_SESSION_DIR` (default `.wwebjs_auth`)
  - `WHATSAPP_WEB_CLIENT_ID` (default `loanflow`)
  - `WHATSAPP_WEB_HEADLESS` (`true`/`false`)
  - `WHATSAPP_WEB_EXECUTABLE_PATH` (optional Chromium/Chrome path)
  - `WHATSAPP_WEB_AUTO_START` (`true`/`false`, default `true`)
  - `WHATSAPP_WEB_LOG_QR` (`true`/`false`, default `true`)
- Twilio WhatsApp/Voice channel:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_WHATSAPP_FROM_NUMBER` (example `whatsapp:+14155238886`)
  - `TWILIO_WEBHOOK_BASE_URL` (public API base URL for signature validation)
  - `TWILIO_VERIFY_SIGNATURE` (`true`/`false`, default `true`)
- Voice notes and optional voice replies:
  - `WHATSAPP_STT_PROVIDER` (`gemini` or `disabled`)
  - `WHATSAPP_TTS_PROVIDER` (`google` or `disabled`)
  - `WHATSAPP_SEND_VOICE_REPLY` (`true`/`false`)
  - `WHATSAPP_AUTO_VERIFY_LINK` (`true`/`false`, auto-verifies linked number on first inbound message)
  - `GOOGLE_TTS_API_KEY` (required when `WHATSAPP_TTS_PROVIDER=google`)
  - `GOOGLE_TTS_LANGUAGE_CODE` (default `en-US`)
  - `GOOGLE_TTS_VOICE_NAME` (optional)

## Backend Commands

- `npm run server:dev` start backend in watch mode
- `npm run server:start` start backend once
- `npm run typecheck:server` type-check backend

Frontend commands are unchanged (`npm run dev`, `npm run build`, etc.).

## Railway Deployment

This repo is a single Railway web service:

- `npm run build` builds the Vite frontend into `dist/`
- `npm start` runs the Express API
- the Express server serves both `/api/*` and the built frontend

Use the repository root as the Railway service root.

Important differences from the generic Nest/Express Railway guides:

- Do not add a Railway Postgres service for this app unless you are intentionally replacing Supabase.
- This app already uses Supabase for auth, storage, and database access.
- For a single Railway service, leave `VITE_API_BASE_URL` empty so the frontend uses same-origin `/api/*` calls.

Recommended GitHub deploy flow:

1. Create a new Railway project.
2. Choose `Deploy from GitHub repo` and select this repository.
3. Add these service variables before the first successful build:
   - `NODE_ENV=production`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AGENT_WEBHOOK_SECRET`
   - `CORS_ORIGIN=https://<your-service-domain>`
   - `APP_BASE_URL=https://<your-service-domain>`
4. Deploy the service.
5. In Railway service settings, generate a public domain.
6. Update `CORS_ORIGIN` and `APP_BASE_URL` to that final Railway domain if you deployed before the domain existed.

Optional Railway variables:

- `SUPABASE_DOCS_BUCKET`
- `ML_ASSETS_DIR`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_AUTO_START`
- `TELEGRAM_POLL_INTERVAL_MS`
- `WHATSAPP_PROVIDER`
- `WHATSAPP_WEB_SESSION_DIR`
- `WHATSAPP_WEB_CLIENT_ID`
- `WHATSAPP_WEB_HEADLESS`
- `WHATSAPP_WEB_EXECUTABLE_PATH`
- `WHATSAPP_WEB_AUTO_START`
- `WHATSAPP_WEB_LOG_QR`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM_NUMBER`
- `TWILIO_WEBHOOK_BASE_URL=https://<your-service-domain>` if you use Twilio signature validation
- OCR / Gemini variables depending on which providers you enable

CLI deploy flow:

1. Install and authenticate the Railway CLI.
2. From the repo root, run `railway init`.
3. Set the same variables listed above on the created service.
4. Run `railway up`.
5. Run `railway domain` or generate a domain from the Railway dashboard.

Notes:

- `railway.json` already points Railway to `npm start` and `/api/health`.
- `API_PORT` is only for local development. Railway injects `PORT`, and the server already falls back to that automatically.
- `.railwayignore` is configured so CLI deploys still upload the frontend source and server knowledge files required for the build/runtime.
- If you keep `OCR_PROVIDER=tesseract`, Railpack images will not include `tesseract` or `pdftoppm`. On Railway, either:
  - switch to `OCR_PROVIDER=azure_document_intelligence` or `google_vision`, or
  - host on an environment where `tesseract` and `pdftoppm` are already installed.

## Heroku Deployment

- Deploy from the repository root with `package.json`, `package-lock.json`, and `Procfile` at the top level.
- If you are deploying from a branch other than local `main`, push it explicitly with `git push heroku <branch>:main`.
- Heroku will use the root `Procfile` (`web: npm start`) for the web process.
- The Express server serves API routes from `/api/*` and the built frontend from `dist/`.
- Heroku runs the `build` script during Node.js deploys, so `dist/` is rebuilt on the platform.
- The app pins the Heroku runtime to Node.js `24.x` via `package.json`.
- Use `.slugignore` to keep local-only files out of the Heroku slug.

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
9. `supabase/migrations/20260302144500_document_availability.sql`
10. `supabase/migrations/20260303120000_bank_agent_access.sql`
11. `supabase/migrations/20260305193000_whatsapp_channel_index.sql`
12. `supabase/migrations/20260307020000_add_telegram_channel.sql`

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
  - `POST /api/agent/link-telegram`
  - `POST /api/agent/chat/webhook`
  - `GET /api/agent/context/:applicationId`
  - `POST /api/agent/actions/log`
- Telegram bot:
  - `GET /api/telegram/status` (localhost Telegram bot polling status)
  - `POST /api/telegram/start` (manually start localhost Telegram polling)
  - `POST /api/telegram/dev/link` (localhost-only chat-id link helper for existing users)
- WhatsApp + voice AI:
  - `POST /api/whatsapp/twilio/webhook` (incoming WhatsApp text, voice notes, and documents)
  - `POST /api/whatsapp/twilio/status` (delivery status callbacks)
  - `POST /api/whatsapp/twilio/voice` (incoming voice call webhook)
  - `POST /api/whatsapp/twilio/voice/process` (speech turn processing)
  - `GET /api/whatsapp/web/status` (localhost WhatsApp Web client state + QR availability)
  - `POST /api/whatsapp/web/start` (manually start the localhost WhatsApp Web client)
  - `POST /api/whatsapp/dev/link` (localhost-only phone link helper for existing users)
  - `POST /api/whatsapp/dev/simulate/text` (localhost text simulation)
  - `POST /api/whatsapp/dev/simulate/voice` (localhost voice-note simulation with multipart file upload)
  - `POST /api/whatsapp/dev/simulate/document` (localhost document upload simulation with multipart file upload)
  - `POST /api/whatsapp/dev/simulate/call` (localhost voice-call turn simulation)

## Localhost Support

The simplest free localhost channel is now Telegram Bot API via long polling:

1. Telegram mode (free, no tunnel, preferred for localhost)
- Create a bot with BotFather and set `TELEGRAM_BOT_TOKEN`
- Run the API locally with `npm run server:dev`
- The bot starts polling automatically when `TELEGRAM_AUTO_START=true`
- Check bot state with `GET http://localhost:4000/api/telegram/status`
- If you disabled auto-start, start it manually with:
  - `POST http://localhost:4000/api/telegram/start`
- Send a message to the bot in a private chat; if the chat is not linked yet the bot will reply with the Telegram `chat_id`
- Link that chat to an existing LoanFlow user with:
  - `POST http://localhost:4000/api/telegram/dev/link`
- After linking, the bot supports real Telegram text, voice notes, PDFs, and images on localhost
- Limitation: Telegram bots do not provide voice-call handling here, so this channel supports voice notes but not live calls

The full WhatsApp assistant logic also supports localhost in three modes:

1. WhatsApp Web mode (free, real WhatsApp on localhost)
- Set `WHATSAPP_PROVIDER=whatsapp_web`
- Run the API locally with `npm run server:dev`
- The server will print a QR code in the terminal on startup
- Scan it from WhatsApp on the phone that should host the LoanFlow assistant
- Check client state with `GET http://localhost:4000/api/whatsapp/web/status`
- If you disabled auto-start, start it manually with:
  - `POST http://localhost:4000/api/whatsapp/web/start`
- Linked users can now send real WhatsApp text, voice notes, PDFs, and images directly to that WhatsApp account
- Limitation: WhatsApp Web does not provide PSTN or WhatsApp call webhooks here, so live voice calls still require Twilio or a separate call provider. Voice notes are supported.

2. Real Twilio mode
- Run the API locally with `npm run server:dev`
- Expose it with a tunnel such as `ngrok http 4000`
- Set `TWILIO_WEBHOOK_BASE_URL` to the public tunnel URL
- Keep `TWILIO_VERIFY_SIGNATURE=true`

3. Pure localhost simulation mode
- Run the API locally with `npm run server:dev`
- You do not need Twilio or a tunnel
- Link a local phone number to an existing LoanFlow user with:
  - `POST http://localhost:4000/api/whatsapp/dev/link`
- You can call these local dev endpoints directly:
  - `GET http://localhost:4000/api/whatsapp/web/status`
  - `POST http://localhost:4000/api/whatsapp/web/start`
  - `POST http://localhost:4000/api/whatsapp/dev/link`
  - `POST http://localhost:4000/api/whatsapp/dev/simulate/text`
  - `POST http://localhost:4000/api/whatsapp/dev/simulate/voice`
  - `POST http://localhost:4000/api/whatsapp/dev/simulate/document`
  - `POST http://localhost:4000/api/whatsapp/dev/simulate/call`

Example localhost requests:

```bash
curl -X POST http://localhost:4000/api/telegram/dev/link \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"chat_id\":\"123456789\"}"
```

```bash
curl -X POST http://localhost:4000/api/whatsapp/dev/link \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"phone_number\":\"+94770000000\"}"
```

```bash
curl -X POST http://localhost:4000/api/whatsapp/dev/simulate/text \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"+94770000000\",\"body\":\"Can I get a loan for my grocery business?\"}"
```

```bash
curl -X POST http://localhost:4000/api/whatsapp/dev/simulate/call \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"+94770000000\",\"speechResult\":\"What documents do I need for a small business loan?\"}"
```

```bash
curl -X POST http://localhost:4000/api/whatsapp/dev/simulate/document \
  -F "from=+94770000000" \
  -F "body=bank statement" \
  -F "file=@C:/path/to/statement.pdf"
```

```bash
curl -X POST http://localhost:4000/api/whatsapp/dev/simulate/voice \
  -F "from=+94770000000" \
  -F "body=voice note test" \
  -F "file=@C:/path/to/voice.ogg"
```

Local simulation still requires:
- an existing LoanFlow user profile
- either `POST /api/whatsapp/dev/link` or a valid `user_channel_links` row for linked-user flows
- Gemini keys for AI replies / transcription
- OCR configuration for document scanning

If you only want to test route plumbing on localhost, you can disable Twilio signature checks with `TWILIO_VERIFY_SIGNATURE=false`.
