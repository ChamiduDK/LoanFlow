# SME_LoanHub Testing and Validation

## 1. Purpose

This document defines the testing and validation approach for `SME_LoanHub` (LoanFlow), including:

- overall testing strategy
- validation objectives
- test environments and execution flow
- entry and exit criteria
- defect handling expectations
- detailed test cases across all relevant test types

The goal is to verify that the platform is correct, secure, reliable, usable, and deployable across its main capabilities:

- SME user onboarding and authentication
- loan application creation and evaluation
- document upload, OCR, and verification
- loan recommendation and result presentation
- application tracking and outcome management
- admin bank/product/rule/document management
- ML training, readiness checks, prediction, and explanation
- chatbot, knowledge retrieval, and channel integrations
- WhatsApp and Telegram-assisted user workflows

## 2. System Under Test

### 2.1 Major components

- Frontend: React + Vite application in `src/`
- Backend: Express + TypeScript API in `server/`
- Data layer: Supabase auth, database, storage, and RLS policies
- ML layer: training, readiness, preprocessing, prediction, explanation, metrics
- OCR/document layer: local/provider OCR plus AI-assisted document classification
- Messaging layer: WhatsApp Web, Twilio WhatsApp, Telegram bot, agent chat webhook

### 2.2 In-scope modules

- Auth and profile management
- Bank, product, scheme, and rules management
- Loan application submission and editing
- Eligibility evaluation and loan recommendation ranking
- Document upload, availability, scan, and completeness checks
- Tracker, installments, proposals, and outcomes
- Knowledge base retrieval and AI chat
- Admin ML lifecycle: readiness, train, activate, predict
- Messaging and channel linking flows

### 2.3 Out of scope

- Third-party provider internal correctness (Supabase, Twilio, Telegram, Google, Azure)
- Telecom network behavior outside application control
- Browser engine defects

## 3. Testing Objectives

The release is acceptable only if the following are validated:

1. Critical business flows complete successfully for approved users and admins.
2. Authorization boundaries prevent data leakage and privilege escalation.
3. Loan evaluation returns stable, explainable recommendations with correct fallback behavior.
4. Document ingestion supports the configured formats and handles OCR/AI uncertainty safely.
5. ML training and prediction obey readiness and consent constraints.
6. Chatbot and messaging channels behave safely, including PII masking for non-admin users.
7. The system tolerates expected failures such as provider outages, missing ML artifacts, and malformed inputs.
8. Production deployment starts cleanly and serves both the API and built frontend.

## 4. Current Automated Baseline

The repository already contains automated Vitest coverage in `src/test/` for:

- utility/unit tests:
  - API client behavior
  - auth/feature access helpers
  - loan math and formatting
  - PII masking
  - ranking blend logic
  - knowledge chunking and similarity
- service-level tests:
  - chatbot service
  - document service
  - evaluation service
  - outcome service consent rules
  - ML prediction
  - training readiness
  - explanation generation
- page/component tests:
  - admin ML page
  - document upload page
  - loan results page

Current gaps relative to a full release test strategy:

- backend route integration tests
- database/RLS validation against a live Supabase-backed environment
- end-to-end browser tests across full user journeys
- security, performance, accessibility, compatibility, and resilience automation
- channel integration tests for WhatsApp/Twilio/Telegram

## 5. Test Types

All relevant test types for this application are listed below.

| Test type | Objective | Main target areas | Suggested method/tool |
| --- | --- | --- | --- |
| Static testing | Detect defects before execution | TypeScript, schemas, config, SQL, code review | `tsc`, ESLint, peer review |
| Smoke testing | Confirm build and critical routes are up | app boot, health, login, dashboard | manual or Playwright smoke suite |
| Sanity testing | Confirm a focused fix works | changed route/page/service | targeted Vitest/API checks |
| Unit testing | Verify isolated functions and rules | utils, scoring, masking, readiness, formatting | Vitest |
| Component/UI testing | Verify page and component behavior | route guards, forms, results pages | Vitest + React Testing Library |
| Integration testing | Verify service-to-service behavior | evaluation + ML + ranking, documents + OCR, tracker + outcome | Vitest with mocks / local dependencies |
| API/contract testing | Verify endpoints, status codes, payloads | Express routes, schema validation, auth | Supertest or HTTP collection |
| Database/RLS testing | Verify data integrity and access control | Supabase tables, policies, audit logs | SQL tests / seeded QA env |
| System/E2E testing | Verify real user workflows across layers | signup to application to results to tracker | Playwright / manual UAT |
| Regression testing | Prevent reintroduction of previous defects | all changed modules | automated suite + focused manual checklist |
| User acceptance testing | Confirm business fit | SME user, admin, bank agent flows | scripted UAT sessions |
| Exploratory testing | Find edge-case and usability issues | chat, uploads, validation, navigation | time-boxed manual testing |
| Security testing | Validate confidentiality, integrity, authz, abuse prevention | auth, admin routes, file upload, webhooks, PII masking | manual adversarial tests, ZAP, review |
| Performance testing | Validate responsiveness and throughput | health, evaluations, list endpoints, chat | k6 / Artillery / Lighthouse |
| Load testing | Verify sustained concurrent use | APIs, document scan queue, chat endpoints | k6 / Artillery |
| Stress testing | Observe failure behavior past limits | rate-limited APIs, OCR, chat, prediction | staged overload tests |
| Volume testing | Validate large records/files/data sets | applications, documents, knowledge chunks | seeded QA data |
| Compatibility testing | Verify browser/device behavior | desktop/mobile UI | Chrome, Edge, Firefox, Android |
| Accessibility testing | Verify inclusive use | keyboard nav, labels, semantics, contrast | axe, Lighthouse, manual keyboard |
| Usability testing | Verify user comprehension and task completion | onboarding, apply, results, tracker | scripted observation |
| Recovery/resilience testing | Verify graceful degradation | Supabase failures, OCR timeout, ML missing | fault injection/manual |
| Installation/deployment testing | Verify deployability | build, server start, env validation | CI/CD or local release checklist |
| Data migration testing | Verify schema evolution | SQL migrations and seeds | migration replay in clean DB |
| Backup/restore validation | Verify operational recovery | database/storage recovery runbook | controlled restore exercise |
| ML validation testing | Verify training rules and model output safety | readiness, bootstrap controls, prediction, explanations | Vitest + offline validation set |
| OCR/document validation | Verify file support and document decisions | JPEG/PDF/image handling, keyword checks, AI unclear paths | file-based tests |
| Channel/integration testing | Verify WhatsApp/Telegram interactions | link flows, webhook validation, voice/doc handling | local simulation + provider sandbox |

## 6. Test Strategy

### 6.1 Shift-left validation

- Run `lint`, `typecheck`, and unit tests on every change set.
- Review schema and authorization changes carefully because the system contains admin-only and user-specific data flows.
- Require test evidence for any change affecting:
  - evaluation logic
  - ML training/prediction
  - file upload/document rules
  - authentication or approval gating
  - WhatsApp/Telegram/Twilio handling

### 6.2 Risk-based priority

Highest priority areas:

- authentication and approval gating
- RLS/data isolation
- admin authorization
- application evaluation and recommendation output
- document upload and verification
- ML readiness, consent, and fallback logic
- webhook/channel security

Medium priority areas:

- dashboards, navigation, and reporting
- profile management
- loan tracker workflows
- knowledge retrieval relevance

Lower priority areas:

- visual polish issues that do not block task completion
- non-critical copy and cosmetic layout regressions

### 6.3 Automation strategy

Automate first:

- deterministic business rules
- route validation and API response envelopes
- page-state transitions
- regression cases for previously fixed defects
- ML fallback and readiness constraints

Keep manual or semi-automated:

- exploratory usability
- UAT sign-off
- third-party channel sandbox confirmation
- accessibility screen-reader review
- production smoke

## 7. Test Environments

| Environment | Purpose | Data | Notes |
| --- | --- | --- | --- |
| Local developer | fast feedback | mocked or local test data | current Vitest baseline runs here |
| Local integration | service interaction testing | seeded Supabase dev project | used for API, documents, channel simulation |
| QA/Staging | release validation | sanitized production-like data | required for E2E, UAT, load, security checks |
| Pre-production | final deployment rehearsal | production-like config | optional but preferred before release |
| Production | post-release smoke only | real data | no destructive testing |

### 7.1 Minimum environment configuration

- frontend build artifacts available
- backend API reachable
- Supabase URL, anon key, and service role configured
- document bucket configured
- ML assets directory set
- channel providers configured as needed for the scenario
- OCR provider configured for document validation scenarios

## 8. Entry and Exit Criteria

### 8.1 Entry criteria

- approved requirements or feature scope
- stable build from current branch
- required env vars configured for the selected environment
- migrations applied successfully
- baseline seed data available
- test cases reviewed for the release scope

### 8.2 Exit criteria

- all critical and high-severity defects resolved or explicitly accepted
- all planned smoke, functional, security, and regression tests passed
- no blocker in signup, login, apply, evaluate, documents, results, or admin control flows
- fallback behavior confirmed for ML and OCR failure conditions
- UAT sign-off captured for affected business flows

## 9. Defect Severity and Priority

| Severity | Meaning | Example |
| --- | --- | --- |
| Critical | release blocker, major data/security failure | user can read another user's application |
| High | major workflow broken, no workaround | evaluation fails for valid applications |
| Medium | partial loss of function with workaround | tracker installment save fails intermittently |
| Low | cosmetic or minor non-blocking issue | layout misalignment on one viewport |

## 10. Test Data Strategy

Required data sets:

- approved regular user
- pending regular user
- admin user
- bank agent access token scenario
- products with different required document sets
- evaluated and non-evaluated applications
- applications with and without stored prediction metadata
- finalized and non-finalized outcomes
- consented real ML outcomes
- synthetic bootstrap ML outcomes
- document files:
  - JPEG
  - PNG
  - PDF
  - unsupported extension
  - blurred/low-text sample
  - forbidden-keyword sample
- linked WhatsApp number and linked Telegram chat

## 11. Recommended Execution Flow

1. Static checks: ESLint, TypeScript, schema review.
2. Unit and component tests: current Vitest suite.
3. Backend integration/API tests: route and service contract checks.
4. Database/RLS tests: seeded QA environment.
5. E2E workflow tests: browser and channel flows.
6. Non-functional tests: security, performance, accessibility, compatibility.
7. UAT and production smoke.

## 12. Traceability Matrix

| Requirement area | Existing automated coverage | Additional validation required |
| --- | --- | --- |
| Auth and route protection | `auth-utils.test.ts`, page guard behavior in UI tests | API auth route tests, session/cookie tests |
| Application evaluation | `evaluation.test.ts`, `ranking.test.ts`, `prediction.test.ts` | route-level tests, live data checks, performance |
| Loan results | `loan-results.test.tsx` | E2E validation with actual application lifecycle |
| Documents and OCR | `document.service.test.ts`, `document-upload.test.tsx` | upload API tests, OCR provider timeout tests, storage integration |
| Chatbot and knowledge | `chatbot.test.ts`, `knowledge.test.ts` | channel integration, prompt safety, webhook auth |
| ML admin lifecycle | `training-readiness.test.ts`, `admin-ml.test.tsx`, `explanation.test.ts` | training route tests, artifact persistence, activation flow |
| Outcome/tracker | `outcome.service.test.ts` | tracker route tests, installment flows, audit validation |
| API client | `api-client.test.ts` | server response contract and error envelope tests |

## 13. Detailed Test Cases

Status legend:

- `A`: suitable for automation
- `M`: manual
- `H`: hybrid/manual with provider sandbox or environment dependency

### 13.1 Static, smoke, and sanity tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-STA-001 | Static | TypeScript compile is clean | repo checked out | run `npm run typecheck:server` and frontend type checks | no type errors | A |
| TC-STA-002 | Static | Lint rules pass | repo checked out | run `npm run lint` | no lint errors | A |
| TC-SMK-001 | Smoke | Backend boot and health route | env configured | start server, call `GET /api/health` | returns success and healthy status | A |
| TC-SMK-002 | Smoke | Built frontend is served by Express | `dist/` present | open `/` on running server | index page loads without 5xx | A |
| TC-SMK-003 | Smoke | Login route is reachable | server running | open `/login` | login page renders | A |
| TC-SAN-001 | Sanity | Changed feature still works after a targeted fix | feature-specific build | execute only tests covering the changed module | changed scenario passes without regressions in dependent paths | A |

### 13.2 Unit tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-UNT-001 | Unit | Email normalization trims and lowercases input | none | call auth normalization helper | canonical email returned | A |
| TC-UNT-002 | Unit | Feature access defaults to false for non-admin users | none | evaluate missing feature flags | access denied by default | A |
| TC-UNT-003 | Unit | EMI calculation handles reducing balance correctly | none | call EMI utility with principal, rate, term | expected EMI returned | A |
| TC-UNT-004 | Unit | Currency formatter handles zero and negative values | none | call formatter with `0` and negative amount | formatted LKR string returned without exception | A |
| TC-UNT-005 | Unit | PII masking hides email, phone, NIC, bank details | none | call `maskPii` with sample values | sensitive characters masked | A |
| TC-UNT-006 | Unit | Ranking blend avoids stale zero previous probabilities | none | call blend function with stale zero history | calibration ignores stale zero | A |
| TC-UNT-007 | Unit | Knowledge text chunking splits content into useful segments | sample knowledge text | chunk text | chunks respect boundaries and preserve meaning | A |

### 13.3 Component and UI tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-UI-001 | UI | Guest can access login and signup only | unauthenticated session | navigate to `/login`, `/signup`, and `/dashboard` | guest pages load; protected route redirects or blocks access | A |
| TC-UI-002 | UI | Pending user is blocked from approved-user routes | pending user session | navigate to `/dashboard` or `/apply` | redirected to approval-pending flow | A |
| TC-UI-003 | UI | Loan results page falls back from invalid application id | valid user with existing app | open results with bad query/id | first valid application is used, no crash | A |
| TC-UI-004 | UI | Loan results show eligible and review lenders together with ML labels | evaluated application data | render results page | cards and labels display correct recommendation states | A |
| TC-UI-005 | UI | Document upload refreshes recommendations after availability save | evaluated application exists | save availability and observe page state | recommendation data refreshes automatically | A |
| TC-UI-006 | UI | Admin ML page tolerates missing `training_mode` field | admin session | render admin ML with reduced readiness payload | page falls back safely and remains usable | A |
| TC-UI-007 | UI | Error boundary handles page rendering failure gracefully | injected page error | trigger rendering exception | fallback UI shown; app shell does not hard crash | A |

### 13.4 Integration and service tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-INT-001 | Integration | Evaluation uses ML prediction when active model is available | active trained model, valid application | run evaluation service | recommendations use ML probabilities and store metadata | A |
| TC-INT-002 | Integration | Evaluation falls back to rule-based score if prediction fails | broken or missing predictor | run evaluation service | result still returned using fallback score | A |
| TC-INT-003 | Integration | Prediction falls back when active model is undertrained | active undertrained model | request prediction | fallback path triggered safely | A |
| TC-INT-004 | Integration | Bootstrap-trained model is blocked when bootstrap mode is disabled | bootstrap-only model loaded | request prediction in disallowing env | prediction rejected or fallback used according to rule | A |
| TC-INT-005 | Integration | Outcome consent update allowed only for finalized outcomes | finalized and non-finalized outcomes exist | call consent update for both | finalized updates; non-finalized rejected | A |
| TC-INT-006 | Integration | Document completeness uses canonical document keys | product rules and uploaded files exist | run completeness check | logically equivalent document keys match | A |
| TC-INT-007 | Integration | JPEG upload is accepted for image-based requirements | required docs expect image variant | upload JPEG sample | upload accepted and mapped correctly | A |
| TC-INT-008 | Integration | Chatbot masks PII for customer role but not admin | two sessions: user and admin | ask lookup/prediction-related prompts | customer sees masked values; admin sees full values if allowed | A |
| TC-INT-009 | Integration | Knowledge retrieval returns relevant chunks | indexed knowledge files available | ask scheme/policy question | top chunks are relevant and answer context is grounded | A |
| TC-INT-010 | Integration | Explanation generation identifies positive and negative contributors correctly | prediction result with feature importances | generate explanations | signed contributors match expectations | A |

### 13.5 API and contract tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-API-001 | API | `POST /api/auth/signin` accepts valid credentials | user exists | send valid signin payload | success envelope returned and session/cookie established | A |
| TC-API-002 | API | `POST /api/auth/signin` rejects invalid credentials | user exists | send wrong password | 4xx error with standard API error envelope | A |
| TC-API-003 | API | `POST /api/applications` validates payload | authenticated user | send malformed payload | 4xx validation response, no partial write | A |
| TC-API-004 | API | `POST /api/applications/:id/evaluate` returns evaluation result | evaluated target exists | call endpoint with valid app id | response contains score, recommendations, and stored metadata where applicable | A |
| TC-API-005 | API | `POST /api/applications/:id/documents/upload` handles multipart upload | authenticated user and app id | send supported file + metadata | upload stored, response returns document record | A |
| TC-API-006 | API | `POST /api/applications/:id/documents/check` returns completeness state | uploaded documents exist | call check endpoint | completeness report matches product requirements | A |
| TC-API-007 | API | `POST /api/ml/predict` returns approval prediction for valid request | admin or authorized flow, model available | send valid features payload | standardized prediction response returned | A |
| TC-API-008 | API | `POST /api/ml/train` rejects training when readiness threshold is not met | not enough real consented rows | call train endpoint | 4xx/business-rule failure with clear message | A |
| TC-API-009 | API | `POST /api/agent/chat/message` returns agent reply for linked session | valid session exists | send chat message | reply returned with correct session continuity | A |
| TC-API-010 | API | `POST /api/whatsapp/dev/simulate/document` accepts supported test document | local dev channel linked | send multipart document simulation | message processed and document workflow triggered | H |
| TC-API-011 | API | `POST /api/telegram/dev/link` links a Telegram chat to an existing user | user exists | send email + chat_id | link stored successfully | H |

### 13.6 Database, migration, and data integrity tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-DAT-001 | Data | User cannot read another user's application data | two users with distinct applications | query data as user A for user B record | access denied or empty result under RLS | H |
| TC-DAT-002 | Data | Admin can list users and applications | admin user exists | call admin listing routes | data returned according to admin privileges | A |
| TC-DAT-003 | Data | Admin mutations write audit entries | audit logging enabled | update a bank/product/user approval state | audit log record created with actor and action | H |
| TC-DAT-004 | Data | Migrations replay cleanly on an empty database | clean Supabase project | apply all migrations and seed | schema and seed complete without error | H |
| TC-DAT-005 | Data | New migration preserves existing required document data | baseline data with documents present | apply latest migration | existing rows still query correctly; no corruption | H |
| TC-DAT-006 | Data | Outcome consent state persists correctly | finalized outcome exists | update consent and re-fetch | persisted value matches request | A |

### 13.7 System and end-to-end tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-E2E-001 | System | Approved user completes signup, signin, application, evaluation, and views results | clean test user, required product data | complete the full browser flow | results page shows recommendations without manual DB intervention | H |
| TC-E2E-002 | System | Approved user uploads documents and views tracker state | existing application | upload required documents, run checks, open tracker | document statuses and tracker information remain consistent | H |
| TC-E2E-003 | System | Admin creates bank/product, configures rules, and sees them in user flow | admin session | create bank/product/rules, then evaluate as user | new product becomes available in recommendation flow | H |
| TC-E2E-004 | System | Bank agent access token opens authorized context only | valid and invalid token variants | open bank-agent access URL | valid token grants limited view; invalid token blocked | H |

### 13.8 Regression tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-REG-001 | Regression | Invalid application id no longer breaks Loan Results | valid user with at least one application | reproduce prior invalid-id path | graceful fallback occurs | A |
| TC-REG-002 | Regression | Document availability save still refreshes recommendation data | evaluated application exists | reproduce prior document availability sequence | refreshed recommendations visible | A |
| TC-REG-003 | Regression | Admin ML page remains stable when readiness payload shape changes | admin session | load page with omitted optional field | no crash or blank state | A |
| TC-REG-004 | Regression | Prediction metadata remains available in stored evaluation results | evaluated application exists | save evaluation, re-fetch evaluation | metadata persists and is readable | A |

### 13.9 Security tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-SEC-001 | Security | Unauthenticated access to protected APIs is blocked | no session | call `/api/applications`, `/api/admin/overview`, `/api/ml/models` | 401/403 returned consistently | A |
| TC-SEC-002 | Security | Non-admin user cannot access admin routes or data | regular approved user | call admin endpoints and admin UI routes | access denied with no privileged data leakage | A |
| TC-SEC-003 | Security | PII masking is enforced in chatbot lookup flows for customers | customer session linked to application | request sensitive lookup data | masked response returned | A |
| TC-SEC-004 | Security | Rate limiter throttles abusive request bursts | test client available | send burst traffic to sensitive routes | rate limit response returned after threshold | H |
| TC-SEC-005 | Security | Invalid or missing Twilio signature is rejected when verification is enabled | Twilio mode configured | send forged webhook | request rejected and not processed | H |
| TC-SEC-006 | Security | Unsupported executable upload is rejected | authenticated user | attempt `.exe` or disallowed MIME upload | upload blocked with validation error | A |
| TC-SEC-007 | Security | Input validation prevents malformed JSON/oversized body abuse | API reachable | send malformed or oversized payload | safe 4xx/413 response, no crash | A |
| TC-SEC-008 | Security | Signed agent webhook validation rejects bad secret | webhook secret configured | call `/api/agent/chat/webhook` with invalid signature | request denied | A |

### 13.10 Performance, load, stress, and volume tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-PERF-001 | Performance | Health and bank listing endpoints meet response-time target | staging env, baseline data | run 100 sequential requests | p95 latency stays within target threshold | H |
| TC-PERF-002 | Performance | Evaluation endpoint meets response-time target under moderate concurrency | seeded applications and active model | run concurrent evaluation requests | acceptable p95 and no error spike | H |
| TC-PERF-003 | Load | Chat endpoint sustains expected concurrent sessions | staging env, linked sessions | generate sustained chat traffic | service remains responsive within SLA | H |
| TC-PERF-004 | Stress | OCR/document scan fails gracefully beyond configured timeout | large or noisy PDF set | scan until timeout threshold exceeded | clear timeout/error state, no process crash | H |
| TC-PERF-005 | Volume | System handles large application/document history for one user | seeded high-volume data | open results, tracker, documents pages | pagination/query behavior remains acceptable | H |
| TC-PERF-006 | Volume | Knowledge retrieval performs acceptably with expanded knowledge base | enlarged knowledge corpus | execute repeated knowledge queries | retrieval remains within target threshold | H |

### 13.11 Accessibility, compatibility, and usability tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-ACC-001 | Accessibility | Keyboard-only user can navigate login and submit form | browser open | use Tab/Shift+Tab/Enter only | all controls reachable and operable | M |
| TC-ACC-002 | Accessibility | Forms expose labels and validation messages to assistive tech | screen reader or axe | inspect auth/application/document forms | accessible names and error feedback present | H |
| TC-ACC-003 | Accessibility | Color contrast is acceptable for core dashboard/actions | browser + analyzer | review key pages with contrast tooling | no blocking contrast failures | H |
| TC-CMP-001 | Compatibility | App works on latest Chrome, Edge, Firefox desktop | staging env | run smoke flow in each browser | critical flows behave consistently | M |
| TC-CMP-002 | Compatibility | App works on Android mobile viewport | mobile device or emulator | run login, apply, results, documents | responsive layout usable with no blocked actions | M |
| TC-USA-001 | Usability | First-time SME user can complete apply-to-results flow without help | facilitator and scripted session | observe representative user attempt flow | task completes with acceptable confusion/error rate | M |
| TC-USA-002 | Usability | Admin can locate and configure required documents efficiently | admin test user | ask admin to update a product's document requirements | task completed without navigation dead ends | M |

### 13.12 Recovery, resilience, backup, and deployment tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-RES-001 | Resilience | Missing ML artifact triggers safe fallback during evaluation | active model metadata points to missing artifact | run evaluation | rule-based fallback used; user sees valid outcome | A |
| TC-RES-002 | Resilience | OCR provider timeout marks document for unclear/manual handling | OCR provider configured with forced timeout | scan document | safe `unclear` or retryable failure state returned | H |
| TC-RES-003 | Resilience | Supabase/API dependency outage is handled without process crash | temporarily unavailable dependency | perform authenticated action | error surfaced gracefully and server remains alive | H |
| TC-RES-004 | Recovery | WhatsApp Web or Telegram service restart restores operability | linked channel present | restart service and resend message | channel reconnects and processes new message | H |
| TC-OPS-001 | Deployment | Production build completes successfully | clean workspace | run `npm run build` | build finishes and assets are generated | A |
| TC-OPS-002 | Deployment | Express server starts with production-like env | production-like env vars set | run `npm start` | server boots and serves `/api/health` and `/` | A |
| TC-OPS-003 | Deployment | Missing critical env var fails fast with clear message | one required env var intentionally removed | start server | startup failure is explicit and actionable | A |
| TC-BKP-001 | Backup/Restore | Database backup can be restored into a clean environment | backup artifact available | restore backup into test environment | core tables and relations recover intact | H |

### 13.13 ML, OCR, and channel-specific validation tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-ML-001 | ML validation | Readiness reports additional real consented samples needed | insufficient real data | request readiness/report | deficit count is accurate | A |
| TC-ML-002 | ML validation | Synthetic bootstrap data can be used only in allowed environments | bootstrap mode enabled locally, disabled in production-like env | compare readiness/train behavior across envs | local bootstrap allowed; production-like flow blocked | A |
| TC-ML-003 | ML validation | Stored evaluation retains prediction metadata and explanation inputs | evaluated application exists | fetch stored evaluation after prediction | metadata is present and internally consistent | A |
| TC-ML-004 | ML validation | Activated model list shows correct active/inactive state | multiple model records exist | activate one model then query models | exactly one expected active model returned | A |
| TC-OCR-001 | OCR validation | JPEG file support works for image-based required document types | product with image requirement | upload JPEG and run checks | file accepted and classified correctly | A |
| TC-OCR-002 | OCR validation | Forbidden keyword rule invalidates a document | rule configured with forbidden term | scan document containing term | document marked invalid with rule reason | H |
| TC-OCR-003 | OCR validation | Low-text or ambiguous scan is marked unclear | low-quality image/PDF | scan document | result is `unclear` or manual review path, not false-valid | H |
| TC-CHN-001 | Channel | Telegram linked user asks loan question and receives contextual response | Telegram bot linked | send text from linked chat | agent responds in correct channel context | H |
| TC-CHN-002 | Channel | WhatsApp linked user uploads a document and processing starts | WhatsApp link exists | send/simulate supported document | upload pipeline and follow-up response trigger correctly | H |
| TC-CHN-003 | Channel | Voice note transcription flows into agent response when STT is enabled | linked WhatsApp user and STT provider configured | send/simulate voice note | speech is transcribed and reply generated | H |

### 13.14 User acceptance tests

| ID | Type | Scenario | Preconditions | Steps | Expected result | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-UAT-001 | UAT | SME applicant can create an account, apply, upload documents, and understand results | representative user, staging env | complete full journey without developer help | user completes flow and confirms output is understandable | M |
| TC-UAT-002 | UAT | Admin can manage products, rules, users, and ML controls | admin stakeholder | execute admin management tasks | stakeholder confirms workflow supports operations | M |
| TC-UAT-003 | UAT | Customer support/bank operations user can use channel integrations to assist applicants | linked staging accounts | test Telegram/WhatsApp support journey | stakeholder confirms channel flow is business-ready | M |

## 14. Recommended Release Gate

Minimum release gate for a production deployment:

- static checks pass
- current automated Vitest suite passes
- API smoke and auth checks pass
- at least one successful end-to-end applicant flow in staging
- admin flow validated in staging
- security checks for authz, upload validation, and webhook verification completed
- ML fallback and OCR unclear-path scenarios verified

## 15. Recommended Next Automation Additions

To move from the current baseline to broader release confidence, add these next:

1. Express route tests for auth, applications, documents, ML, outcome, and admin APIs.
2. Playwright smoke/E2E tests for:
   - login
   - apply
   - results
   - document upload
   - admin ML
3. Supabase/RLS validation scripts for cross-user isolation.
4. k6 or Artillery checks for evaluation and chat endpoints.
5. Accessibility automation with `axe`.
6. Channel simulation regression checks for WhatsApp and Telegram routes.

## 16. Executed Test Run Summary

The following checks were executed in this workspace on March 10, 2026.

| ID | Command | Scope | Result | Notes |
| --- | --- | --- | --- | --- |
| EXE-001 | `npm test` | configured Vitest suite under `src/test/` | Pass | 16 test files passed, 56 tests passed |
| EXE-002 | `npm run lint` | repo lint baseline | Pass with warnings | 0 errors, 50 warnings |
| EXE-003 | `npm run typecheck:server` | backend TypeScript | Pass | no type errors |
| EXE-004 | `npx tsc -p tsconfig.app.json --noEmit` | frontend TypeScript | Pass | no type errors |
| EXE-005 | `npm run build` | production frontend build | Pass with warnings | Vite chunk-size warning on large bundles/assets |
| EXE-006 | `npx vitest run -c <temp reindex config>` | root `reindex.test.ts` | Pass | 1 test passed; reindex completed with 23 chunks |

### 16.1 Current warnings and observations

- UI tests emit non-failing `act(...)` warnings from Radix-driven components during Vitest runs.
- Lint warnings are concentrated in:
  - `@typescript-eslint/no-explicit-any`
  - `react-hooks/exhaustive-deps`
  - `react-refresh/only-export-components`
- The production build completed, but Vite reported large chunk warnings, especially for the vendor bundle and large image assets.
