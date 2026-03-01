# SME LoanHub Data Dictionary

Source of truth: `supabase/migrations/*.sql` (through `20260225143000_document_verification_rules.sql`).

## Enums

| Enum | Values |
|---|---|
| `public.application_status` | `draft`, `submitted`, `evaluated`, `applied`, `under_review`, `approved`, `rejected`, `withdrawn` |
| `public.document_status` | `uploaded`, `processing`, `verified`, `rejected`, `needs_review` |
| `public.outcome_status` | `applied`, `under_review`, `approved`, `rejected` |
| `public.installment_status` | `pending`, `paid`, `late` |
| `public.channel_type` | `whatsapp`, `email`, `sms`, `web` |
| `public.chat_session_status` | `active`, `closed`, `archived` |
| `public.chat_message_role` | `user`, `assistant`, `system`, `tool` |

## External Reference

| Table | Notes |
|---|---|
| `auth.users` | Supabase Auth table. `public.profiles.id` references `auth.users.id` (`ON DELETE CASCADE`). |

## Tables

### `public.profiles`

Primary key: `id`  
Unique: `email`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | - | PK, FK -> `auth.users.id` |
| `email` | `text` | Yes | - | User email |
| `full_name` | `text` | Yes | - | Full name |
| `phone` | `text` | Yes | - | Phone number |
| `district` | `text` | Yes | - | District |
| `business_name` | `text` | Yes | - | Business name |
| `business_type` | `text` | Yes | - | Business type |
| `industry` | `text` | Yes | - | Industry |
| `years_active` | `integer` | Yes | - | `>= 0` if present |
| `annual_turnover` | `numeric(14,2)` | Yes | - | `>= 0` if present |
| `monthly_income` | `numeric(14,2)` | Yes | - | `>= 0` if present |
| `monthly_expenses` | `numeric(14,2)` | Yes | - | `>= 0` if present |
| `existing_loan_obligations` | `numeric(14,2)` | Yes | - | `>= 0` if present |
| `turnover_band` | `text` | Yes | - | Turnover category |
| `is_admin` | `boolean` | No | `false` | Admin flag |
| `metadata` | `jsonb` | No | `'{}'::jsonb` | Extra profile metadata |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.banks`

Primary key: `id`  
Unique: `name`, `code`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `name` | `text` | No | - | Bank name |
| `code` | `text` | No | - | Bank code |
| `website` | `text` | Yes | - | Website URL |
| `contact_email` | `text` | Yes | - | Contact email |
| `is_active` | `boolean` | No | `true` | Active flag |
| `metadata` | `jsonb` | No | `'{}'::jsonb` | Extra bank metadata |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.loan_products`

Primary key: `id`  
Foreign keys: `bank_id` -> `public.banks.id`  
Unique: `slug`, (`bank_id`, `name`)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `bank_id` | `uuid` | No | - | FK to bank |
| `name` | `text` | No | - | Product name |
| `slug` | `text` | No | - | URL-safe unique slug |
| `description` | `text` | Yes | - | Product description |
| `purpose_category` | `text` | Yes | - | Use-case category |
| `min_amount` | `numeric(14,2)` | No | - | `>= 0` |
| `max_amount` | `numeric(14,2)` | No | - | `>= min_amount` |
| `rate_min` | `numeric(5,2)` | No | - | `>= 0` |
| `rate_max` | `numeric(5,2)` | No | - | `>= rate_min` |
| `tenure_min_months` | `integer` | No | - | `>= 1` |
| `tenure_max_months` | `integer` | No | - | `>= tenure_min_months` |
| `collateral_required` | `boolean` | No | `false` | Collateral required flag |
| `processing_days_min` | `integer` | Yes | - | `>= 1` if present |
| `processing_days_max` | `integer` | Yes | - | `>= processing_days_min` when both exist |
| `is_active` | `boolean` | No | `true` | Active flag |
| `metadata` | `jsonb` | No | `'{}'::jsonb` | Extra product metadata |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.loan_terms`

Primary key: `id`  
Foreign keys: `product_id` -> `public.loan_products.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `product_id` | `uuid` | No | - | FK to product |
| `term_label` | `text` | No | - | Label for term bucket |
| `min_tenure_months` | `integer` | No | - | `>= 1` |
| `max_tenure_months` | `integer` | No | - | `>= min_tenure_months` |
| `interest_rate_min` | `numeric(5,2)` | No | - | `>= 0` |
| `interest_rate_max` | `numeric(5,2)` | No | - | `>= interest_rate_min` |
| `processing_fee_pct` | `numeric(5,2)` | Yes | - | `>= 0` if present |
| `late_fee_pct` | `numeric(5,2)` | Yes | - | `>= 0` if present |
| `prepayment_allowed` | `boolean` | No | `true` | Prepayment policy |
| `extra_terms` | `jsonb` | No | `'{}'::jsonb` | Additional term structure |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.eligibility_rules`

Primary key: `id`  
Foreign keys: `product_id` -> `public.loan_products.id`, `created_by` -> `public.profiles.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `product_id` | `uuid` | No | - | FK to product |
| `version` | `integer` | No | `1` | Rule version |
| `rules_json` | `jsonb` | No | `'{}'::jsonb` | Eligibility logic payload |
| `is_active` | `boolean` | No | `true` | Active rule version |
| `created_by` | `uuid` | Yes | - | Admin profile creating rule |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.required_documents`

Primary key: `id`  
Foreign keys: `product_id` -> `public.loan_products.id`  
Unique: (`product_id`, `document_type`)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `product_id` | `uuid` | No | - | FK to product |
| `document_type` | `text` | No | - | Internal document type key |
| `display_name` | `text` | No | - | UI display label |
| `is_required` | `boolean` | No | `true` | Mandatory doc flag |
| `notes` | `text` | Yes | - | Free-text notes |
| `accepted_formats` | `text[]` | No | `array['pdf','jpg','png']::text[]` | Accepted upload formats |
| `verification_rules_json` | `jsonb` | No | `'{}'::jsonb` | OCR/AI verification rules |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.benefits`

Primary key: `id`  
Foreign keys: `product_id` -> `public.loan_products.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `product_id` | `uuid` | No | - | FK to product |
| `title` | `text` | No | - | Benefit title |
| `description` | `text` | Yes | - | Benefit details |
| `is_highlight` | `boolean` | No | `false` | Highlight flag |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.collateral`

Primary key: `id`  
Foreign keys: `product_id` -> `public.loan_products.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `product_id` | `uuid` | No | - | FK to product |
| `collateral_type` | `text` | No | - | Collateral category |
| `min_value_ratio` | `numeric(8,2)` | Yes | - | `>= 0` if present |
| `notes` | `text` | Yes | - | Collateral notes |
| `is_optional` | `boolean` | No | `false` | Optional collateral flag |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.loan_applications`

Primary key: `id`  
Foreign keys: `user_id` -> `public.profiles.id`, `selected_product_id` -> `public.loan_products.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | No | - | Applicant profile |
| `requested_amount` | `numeric(14,2)` | No | - | `> 0` |
| `purpose` | `text` | No | - | Loan purpose |
| `preferred_tenure_months` | `integer` | No | - | `>= 1` |
| `collateral_available` | `boolean` | No | `false` | Collateral available |
| `collateral_type` | `text` | Yes | - | Collateral type text |
| `status` | `public.application_status` | No | `'draft'` | Application lifecycle |
| `profile_snapshot` | `jsonb` | Yes | - | Captured profile at apply time |
| `business_context` | `jsonb` | Yes | - | Captured business context |
| `selected_product_id` | `uuid` | Yes | - | Chosen product, if any |
| `submitted_at` | `timestamptz` | Yes | - | Submission time |
| `tracking_started_at` | `timestamptz` | Yes | - | Tracker flow start |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.application_results`

Primary key: `id`  
Foreign keys: `application_id` -> `public.loan_applications.id`, `product_id` -> `public.loan_products.id`, `bank_id` -> `public.banks.id`  
Unique: (`application_id`, `product_id`)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `application_id` | `uuid` | No | - | FK to application |
| `product_id` | `uuid` | No | - | FK to product |
| `bank_id` | `uuid` | No | - | FK to bank |
| `eligibility_passed` | `boolean` | No | - | Eligibility outcome |
| `eligibility_score` | `numeric(5,2)` | No | - | `0..100` |
| `reasons_json` | `jsonb` | No | `'[]'::jsonb` | Explanation list |
| `emi` | `numeric(14,2)` | No | - | `>= 0` |
| `total_interest` | `numeric(14,2)` | No | - | `>= 0` |
| `total_payable` | `numeric(14,2)` | No | - | `>= 0` |
| `estimated_rate` | `numeric(5,2)` | No | - | `>= 0` |
| `approval_probability` | `numeric(5,2)` | No | - | `0..100` |
| `document_completeness` | `numeric(5,2)` | No | - | `0..100` |
| `ranking_score` | `numeric(8,2)` | No | `0` | Composite rank score |
| `rank_position` | `integer` | Yes | - | Position within result set |
| `result_payload` | `jsonb` | No | `'{}'::jsonb` | Full computed result |
| `initial_probability` | `numeric(5,2)` | Yes | - | `0..100`, initial estimate |
| `final_probability` | `numeric(5,2)` | Yes | - | `0..100`, post-tracking estimate |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.documents`

Primary key: `id`  
Foreign keys: `application_id` -> `public.loan_applications.id`, `user_id` -> `public.profiles.id`, `product_id` -> `public.loan_products.id`  
Unique: `storage_path`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `application_id` | `uuid` | No | - | FK to application |
| `user_id` | `uuid` | No | - | Owner profile |
| `product_id` | `uuid` | Yes | - | Product context |
| `document_type` | `text` | No | - | Expected document type |
| `file_name` | `text` | No | - | Original file name |
| `storage_bucket` | `text` | No | - | Supabase Storage bucket |
| `storage_path` | `text` | No | - | Object path in bucket |
| `mime_type` | `text` | Yes | - | MIME type |
| `size_bytes` | `bigint` | Yes | - | `>= 0` if present |
| `status` | `public.document_status` | No | `'uploaded'` | Processing/verification state |
| `ocr_data` | `jsonb` | Yes | - | OCR output blob |
| `detected_doc_type` | `text` | Yes | - | Model-detected type |
| `ocr_text` | `text` | Yes | - | Flattened OCR text |
| `extracted_json` | `jsonb` | No | `'{}'::jsonb` | Extracted fields |
| `validation_status` | `text` | No | `'unclear'` | `valid` / `invalid` / `unclear` |
| `metadata` | `jsonb` | No | `'{}'::jsonb` | Extra metadata |
| `uploaded_at` | `timestamptz` | No | `now()` | Upload time |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.document_checks`

Primary key: `id`  
Foreign keys: `application_id` -> `public.loan_applications.id`, `product_id` -> `public.loan_products.id`, `user_id` -> `public.profiles.id`  
Unique: (`application_id`, `product_id`)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `application_id` | `uuid` | No | - | FK to application |
| `product_id` | `uuid` | No | - | FK to product |
| `user_id` | `uuid` | No | - | Owner profile |
| `checklist_json` | `jsonb` | No | `'[]'::jsonb` | Checklist state |
| `missing_docs` | `jsonb` | No | `'[]'::jsonb` | Missing docs list |
| `completeness_score` | `numeric(5,2)` | No | - | `0..100` |
| `validation_notes_json` | `jsonb` | No | `'[]'::jsonb` | Validation notes |
| `checked_at` | `timestamptz` | No | `now()` | Last check time |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.outcomes`

Primary key: `id`  
Foreign keys: `application_id` -> `public.loan_applications.id`, `user_id` -> `public.profiles.id`  
Unique: `application_id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `application_id` | `uuid` | No | - | One outcome per application |
| `user_id` | `uuid` | No | - | Owner profile |
| `status` | `public.outcome_status` | No | - | Applied/decision state |
| `applied_date` | `date` | Yes | - | Application sent date |
| `decision_date` | `date` | Yes | - | Final decision date |
| `approved_amount` | `numeric(14,2)` | Yes | - | `>= 0` if present |
| `approved_rate` | `numeric(5,2)` | Yes | - | `>= 0` if present |
| `approved_tenure_months` | `integer` | Yes | - | `>= 1` if present |
| `consent_for_training` | `boolean` | No | `false` | Consent to use data for ML |
| `notes` | `text` | Yes | - | Outcome notes |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.installments`

Primary key: `id`  
Foreign keys: `application_id` -> `public.loan_applications.id`, `user_id` -> `public.profiles.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `application_id` | `uuid` | No | - | FK to application |
| `user_id` | `uuid` | No | - | Owner profile |
| `due_date` | `date` | No | - | Installment due date |
| `amount` | `numeric(14,2)` | No | - | `> 0` |
| `status` | `public.installment_status` | No | `'pending'` | Payment status |
| `paid_date` | `date` | Yes | - | Actual payment date |
| `notes` | `text` | Yes | - | Notes |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.user_channel_links`

Primary key: `id`  
Foreign keys: `user_id` -> `public.profiles.id`  
Unique: (`user_id`, `channel_type`)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | No | - | Owner profile |
| `channel_type` | `public.channel_type` | No | - | Channel kind |
| `channel_user_id` | `text` | No | - | User identifier on channel |
| `is_verified` | `boolean` | No | `false` | Channel verification flag |
| `linked_at` | `timestamptz` | No | `now()` | Link timestamp |
| `metadata` | `jsonb` | No | `'{}'::jsonb` | Link metadata |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.chat_sessions`

Primary key: `id`  
Foreign keys: `user_id` -> `public.profiles.id`, `application_id` -> `public.loan_applications.id`, `channel_link_id` -> `public.user_channel_links.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | No | - | Owner profile |
| `application_id` | `uuid` | Yes | - | Optional app context |
| `channel_link_id` | `uuid` | Yes | - | Optional channel link context |
| `status` | `public.chat_session_status` | No | `'active'` | Session status |
| `started_at` | `timestamptz` | No | `now()` | Session start |
| `ended_at` | `timestamptz` | Yes | - | Session end |
| `metadata` | `jsonb` | No | `'{}'::jsonb` | Session metadata |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.chat_messages`

Primary key: `id`  
Foreign keys: `session_id` -> `public.chat_sessions.id`, `user_id` -> `public.profiles.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `session_id` | `uuid` | No | - | Parent chat session |
| `user_id` | `uuid` | No | - | Owner profile |
| `role` | `public.chat_message_role` | No | - | Message role |
| `message_text` | `text` | Yes | - | Plain text message |
| `message_json` | `jsonb` | No | `'{}'::jsonb` | Structured message payload |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |

### `public.agent_actions`

Primary key: `id`  
Foreign keys: `user_id` -> `public.profiles.id`, `application_id` -> `public.loan_applications.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | No | - | Owner profile |
| `application_id` | `uuid` | Yes | - | Optional application context |
| `action_type` | `text` | No | - | Action identifier |
| `action_payload` | `jsonb` | No | `'{}'::jsonb` | Input payload |
| `action_status` | `text` | No | `'logged'` | Action state |
| `result_json` | `jsonb` | No | `'{}'::jsonb` | Output payload |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |

### `public.agent_preferences`

Primary key: `id`  
Foreign keys: `user_id` -> `public.profiles.id`, `notification_channel` uses `public.channel_type` enum  
Unique: `user_id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | No | - | Owner profile |
| `language` | `text` | No | `'en'` | Preferred language |
| `notification_channel` | `public.channel_type` | Yes | - | Preferred channel |
| `reminder_frequency` | `text` | No | `'weekly'` | Reminder cadence |
| `preference_json` | `jsonb` | No | `'{}'::jsonb` | Additional preferences |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.audit_logs`

Primary key: `id`  
Foreign keys: `actor_user_id` -> `public.profiles.id`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `bigint` | No | identity | PK |
| `actor_user_id` | `uuid` | Yes | - | Actor profile if known |
| `action` | `text` | No | - | Action name |
| `entity_type` | `text` | No | - | Entity/table label |
| `entity_id` | `uuid` | Yes | - | Affected row id |
| `payload_summary` | `jsonb` | No | `'{}'::jsonb` | Audit summary data |
| `ip_address` | `inet` | Yes | - | Origin IP |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |

### `public.loan_proposals`

Primary key: `id`  
Foreign keys: `application_id` -> `public.loan_applications.id`, `product_id` -> `public.loan_products.id`, `created_by` -> `public.profiles.id`  
Unique: (`application_id`, `product_id`, `proposal_version`)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `application_id` | `uuid` | No | - | FK to application |
| `product_id` | `uuid` | No | - | FK to product |
| `proposal_version` | `integer` | No | `1` | Version number |
| `proposal_data_json` | `jsonb` | No | `'{}'::jsonb` | Proposal payload |
| `html_content` | `text` | Yes | - | Rendered HTML |
| `pdf_file_path` | `text` | Yes | - | Generated PDF location |
| `created_by` | `uuid` | Yes | - | Profile creating proposal |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.ml_training_samples`

Primary key: `id`  
Foreign keys: `application_id` -> `public.loan_applications.id`, `product_id` -> `public.loan_products.id`  
Unique: `sample_key`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `sample_key` | `text` | No | - | Unique sample identifier |
| `application_id` | `uuid` | Yes | - | Source application |
| `product_id` | `uuid` | Yes | - | Source product |
| `outcome_status` | `public.outcome_status` | No | - | Outcome class |
| `label` | `smallint` | No | - | Binary label (`0`/`1`) |
| `feature_json` | `jsonb` | No | `'{}'::jsonb` | Training features |
| `source_snapshot_at` | `timestamptz` | No | `now()` | Snapshot time |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |

### `public.ml_models`

Primary key: `id`  
Foreign keys: `created_by` -> `public.profiles.id`  
Unique: `version`, plus partial unique index where `is_active = true` (only one active model)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `version` | `text` | No | - | Model version string |
| `model_type` | `text` | No | `'tabular_mlp'` | Model family |
| `framework` | `text` | No | `'tfjs'` | Framework |
| `model_file_path` | `text` | No | - | Serialized model path |
| `preprocessing_file_path` | `text` | No | - | Preprocessor path |
| `metrics_json` | `jsonb` | No | `'{}'::jsonb` | Validation metrics |
| `training_meta_json` | `jsonb` | No | `'{}'::jsonb` | Training metadata |
| `trained_sample_count` | `integer` | No | `0` | `>= 0` |
| `is_active` | `boolean` | No | `false` | Active serving model |
| `created_by` | `uuid` | Yes | - | Profile that created model row |
| `trained_at` | `timestamptz` | No | `now()` | Training completion time |
| `activated_at` | `timestamptz` | Yes | - | Activation timestamp |
| `created_at` | `timestamptz` | No | `now()` | Created timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Updated timestamp |
