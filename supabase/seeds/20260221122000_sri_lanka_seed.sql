-- Seed data for Sri Lankan SME loan providers and products
-- Includes seven major local banks and sample SME schemes in LKR terms

insert into public.banks (name, code, website, contact_email, is_active)
values
  ('Bank of Ceylon', 'BOC', 'https://www.boc.lk', 'sme@boc.lk', true),
  ('People''s Bank', 'PB', 'https://www.peoplesbank.lk', 'sme@peoplesbank.lk', true),
  ('Commercial Bank of Ceylon', 'COMBANK', 'https://www.combank.lk', 'sme@combank.lk', true),
  ('Hatton National Bank', 'HNB', 'https://www.hnb.net', 'sme@hnb.net', true),
  ('Sampath Bank', 'SAMPATH', 'https://www.sampath.lk', 'sme@sampath.lk', true),
  ('Seylan Bank', 'SEYLAN', 'https://www.seylan.lk', 'sme@seylan.lk', true),
  ('National Development Bank', 'NDB', 'https://www.ndbbank.com', 'sme@ndbbank.com', true)
on conflict (code)
do update set
  name = excluded.name,
  website = excluded.website,
  contact_email = excluded.contact_email,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.loan_products (
  bank_id,
  name,
  slug,
  description,
  purpose_category,
  min_amount,
  max_amount,
  rate_min,
  rate_max,
  tenure_min_months,
  tenure_max_months,
  collateral_required,
  processing_days_min,
  processing_days_max,
  is_active,
  metadata
)
values
  (
    (select id from public.banks where code = 'BOC'),
    'BOC SME Plus',
    'boc-sme-plus',
    'Working capital and expansion support for registered SMEs with flexible repayment plans.',
    'working_capital',
    500000,
    25000000,
    12.50,
    16.00,
    12,
    60,
    true,
    5,
    8,
    true,
    '{"currency":"LKR","target_segment":"registered_smes"}'::jsonb
  ),
  (
    (select id from public.banks where code = 'PB'),
    'PB SME Assist',
    'pb-sme-assist',
    'Fast-track SME credit line with no collateral requirement for smaller ticket sizes.',
    'working_capital',
    300000,
    15000000,
    13.00,
    17.50,
    6,
    48,
    false,
    3,
    6,
    true,
    '{"currency":"LKR","target_segment":"micro_and_small"}'::jsonb
  ),
  (
    (select id from public.banks where code = 'COMBANK'),
    'ComBank Biz Growth Loan',
    'combank-biz-growth-loan',
    'Expansion-focused lending for growth-stage SMEs requiring medium-term financing.',
    'business_expansion',
    1000000,
    50000000,
    11.50,
    15.00,
    12,
    84,
    true,
    7,
    12,
    true,
    '{"currency":"LKR","target_segment":"growth_smes"}'::jsonb
  ),
  (
    (select id from public.banks where code = 'HNB'),
    'HNB Shilpa Enterprise',
    'hnb-shilpa-enterprise',
    'Sector-aligned SME lending program with advisory support and structured terms.',
    'sector_program',
    500000,
    30000000,
    12.00,
    15.50,
    12,
    72,
    true,
    5,
    9,
    true,
    '{"currency":"LKR","target_segment":"smes_with_collateral"}'::jsonb
  ),
  (
    (select id from public.banks where code = 'SAMPATH'),
    'Sampath Vishwa SME',
    'sampath-vishwa-sme',
    'Digitally enabled SME loan scheme for rapid approval and streamlined processing.',
    'working_capital',
    400000,
    20000000,
    13.25,
    17.00,
    6,
    60,
    false,
    2,
    5,
    true,
    '{"currency":"LKR","target_segment":"digitally_ready_smes"}'::jsonb
  ),
  (
    (select id from public.banks where code = 'SEYLAN'),
    'Seylan SME Booster',
    'seylan-sme-booster',
    'Blended term and working-capital financing for SMEs in retail and services.',
    'mixed_use',
    500000,
    18000000,
    12.75,
    16.75,
    12,
    60,
    false,
    4,
    7,
    true,
    '{"currency":"LKR","target_segment":"retail_and_services"}'::jsonb
  ),
  (
    (select id from public.banks where code = 'NDB'),
    'NDB Araliya SME',
    'ndb-araliya-sme',
    'Structured SME financing for modernization, machinery and business scale-up.',
    'machinery_and_expansion',
    750000,
    35000000,
    11.90,
    15.80,
    12,
    84,
    true,
    6,
    10,
    true,
    '{"currency":"LKR","target_segment":"mid_market_smes"}'::jsonb
  )
on conflict (slug)
do update set
  bank_id = excluded.bank_id,
  name = excluded.name,
  description = excluded.description,
  purpose_category = excluded.purpose_category,
  min_amount = excluded.min_amount,
  max_amount = excluded.max_amount,
  rate_min = excluded.rate_min,
  rate_max = excluded.rate_max,
  tenure_min_months = excluded.tenure_min_months,
  tenure_max_months = excluded.tenure_max_months,
  collateral_required = excluded.collateral_required,
  processing_days_min = excluded.processing_days_min,
  processing_days_max = excluded.processing_days_max,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();

with seeded_products as (
  select id, slug from public.loan_products
  where slug in (
    'boc-sme-plus',
    'pb-sme-assist',
    'combank-biz-growth-loan',
    'hnb-shilpa-enterprise',
    'sampath-vishwa-sme',
    'seylan-sme-booster',
    'ndb-araliya-sme'
  )
)
delete from public.loan_terms where product_id in (select id from seeded_products);

with seeded_products as (
  select id, slug from public.loan_products
  where slug in (
    'boc-sme-plus',
    'pb-sme-assist',
    'combank-biz-growth-loan',
    'hnb-shilpa-enterprise',
    'sampath-vishwa-sme',
    'seylan-sme-booster',
    'ndb-araliya-sme'
  )
)
delete from public.eligibility_rules where product_id in (select id from seeded_products);

with seeded_products as (
  select id, slug from public.loan_products
  where slug in (
    'boc-sme-plus',
    'pb-sme-assist',
    'combank-biz-growth-loan',
    'hnb-shilpa-enterprise',
    'sampath-vishwa-sme',
    'seylan-sme-booster',
    'ndb-araliya-sme'
  )
)
delete from public.required_documents where product_id in (select id from seeded_products);

with seeded_products as (
  select id, slug from public.loan_products
  where slug in (
    'boc-sme-plus',
    'pb-sme-assist',
    'combank-biz-growth-loan',
    'hnb-shilpa-enterprise',
    'sampath-vishwa-sme',
    'seylan-sme-booster',
    'ndb-araliya-sme'
  )
)
delete from public.benefits where product_id in (select id from seeded_products);

with seeded_products as (
  select id, slug from public.loan_products
  where slug in (
    'boc-sme-plus',
    'pb-sme-assist',
    'combank-biz-growth-loan',
    'hnb-shilpa-enterprise',
    'sampath-vishwa-sme',
    'seylan-sme-booster',
    'ndb-araliya-sme'
  )
)
delete from public.collateral where product_id in (select id from seeded_products);

insert into public.loan_terms (
  product_id,
  term_label,
  min_tenure_months,
  max_tenure_months,
  interest_rate_min,
  interest_rate_max,
  processing_fee_pct,
  late_fee_pct,
  prepayment_allowed,
  extra_terms
)
select id, 'Standard SME Term', 12, 60, 12.5, 16.0, 1.0, 2.0, true, '{"grace_months":1}'::jsonb from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'Quick SME Facility', 6, 48, 13.0, 17.5, 0.8, 2.5, true, '{"grace_months":0}'::jsonb from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'Growth Term Loan', 12, 84, 11.5, 15.0, 1.2, 2.0, true, '{"grace_months":2}'::jsonb from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'Shilpa Core Term', 12, 72, 12.0, 15.5, 1.0, 2.2, true, '{"grace_months":1}'::jsonb from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'Digital SME Fast Track', 6, 60, 13.25, 17.0, 0.75, 2.25, true, '{"grace_months":0}'::jsonb from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'Booster SME Flexi', 12, 60, 12.75, 16.75, 0.95, 2.3, true, '{"grace_months":1}'::jsonb from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'Araliya SME Structured', 12, 84, 11.9, 15.8, 1.1, 2.1, true, '{"grace_months":2}'::jsonb from public.loan_products where slug = 'ndb-araliya-sme';

insert into public.eligibility_rules (
  product_id,
  version,
  rules_json,
  is_active
)
select id, 1, '{"min_years_active":2,"allowed_business_types":["Sole Proprietorship","Partnership","Private Limited Company"],"allowed_purposes":["Working Capital","Business Expansion","Machinery & Equipment"],"min_turnover":3000000,"max_amount_ratio_turnover":0.8,"collateral_required":true,"max_existing_obligations_ratio":0.45}'::jsonb, true
from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 1, '{"min_years_active":1,"allowed_business_types":["Sole Proprietorship","Partnership","Private Limited Company"],"allowed_purposes":["Working Capital","Business Expansion"],"min_turnover":1500000,"max_amount_ratio_turnover":0.6,"collateral_required":false,"max_existing_obligations_ratio":0.5}'::jsonb, true
from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 1, '{"min_years_active":3,"allowed_business_types":["Private Limited Company","Partnership"],"allowed_purposes":["Business Expansion","Machinery & Equipment","Import/Export Finance"],"min_turnover":5000000,"max_amount_ratio_turnover":1.0,"collateral_required":true,"max_existing_obligations_ratio":0.4}'::jsonb, true
from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 1, '{"min_years_active":2,"allowed_business_types":["Sole Proprietorship","Partnership","Private Limited Company"],"allowed_purposes":["Working Capital","Business Expansion","Renovation"],"min_turnover":3500000,"max_amount_ratio_turnover":0.85,"collateral_required":true,"max_existing_obligations_ratio":0.45}'::jsonb, true
from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 1, '{"min_years_active":1,"allowed_business_types":["Sole Proprietorship","Partnership","Private Limited Company"],"allowed_purposes":["Working Capital","Business Expansion","Debt Refinancing"],"min_turnover":2000000,"max_amount_ratio_turnover":0.65,"collateral_required":false,"max_existing_obligations_ratio":0.5}'::jsonb, true
from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 1, '{"min_years_active":2,"allowed_business_types":["Sole Proprietorship","Partnership","Private Limited Company"],"allowed_purposes":["Working Capital","Business Expansion","Vehicle Purchase"],"min_turnover":2500000,"max_amount_ratio_turnover":0.75,"collateral_required":false,"max_existing_obligations_ratio":0.5}'::jsonb, true
from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 1, '{"min_years_active":3,"allowed_business_types":["Partnership","Private Limited Company"],"allowed_purposes":["Business Expansion","Machinery & Equipment","Property Purchase"],"min_turnover":4500000,"max_amount_ratio_turnover":0.9,"collateral_required":true,"max_existing_obligations_ratio":0.42}'::jsonb, true
from public.loan_products where slug = 'ndb-araliya-sme';

insert into public.required_documents (
  product_id,
  document_type,
  display_name,
  is_required,
  notes,
  accepted_formats
)
select id, 'nic', 'National Identity Card (NIC)', true, 'Owner or authorized signatory NIC copy', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'business_registration', 'Business Registration Certificate', true, 'Valid business registration proof', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'bank_statements_6m', 'Bank Statements (Last 6 Months)', true, 'Primary operating account statements', array['pdf']::text[] from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'financial_statements', 'Financial Statements', true, 'Latest management/accounting statements', array['pdf']::text[] from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'collateral_docs', 'Collateral Documents', true, 'Title deeds / ownership documents', array['pdf','jpg']::text[] from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'nic', 'National Identity Card (NIC)', true, 'Owner or authorized signatory NIC copy', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'business_registration', 'Business Registration Certificate', true, 'Valid business registration proof', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'bank_statements_6m', 'Bank Statements (Last 6 Months)', true, 'Primary operating account statements', array['pdf']::text[] from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'financial_statements', 'Financial Statements', true, 'Latest management/accounting statements', array['pdf']::text[] from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'tax_returns', 'Tax Returns', false, 'Recent annual return or VAT records', array['pdf']::text[] from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'nic', 'National Identity Card (NIC)', true, 'Owner or authorized signatory NIC copy', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'business_registration', 'Business Registration Certificate', true, 'Valid business registration proof', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'bank_statements_6m', 'Bank Statements (Last 6 Months)', true, 'Primary operating account statements', array['pdf']::text[] from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'financial_statements', 'Financial Statements', true, 'Audited statements preferred', array['pdf']::text[] from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'collateral_docs', 'Collateral Documents', true, 'Property or fixed asset evidence', array['pdf','jpg']::text[] from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'nic', 'National Identity Card (NIC)', true, 'Owner or authorized signatory NIC copy', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'business_registration', 'Business Registration Certificate', true, 'Valid business registration proof', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'bank_statements_6m', 'Bank Statements (Last 6 Months)', true, 'Primary operating account statements', array['pdf']::text[] from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'financial_statements', 'Financial Statements', true, 'Latest management/accounting statements', array['pdf']::text[] from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'collateral_docs', 'Collateral Documents', true, 'Asset ownership documentation', array['pdf','jpg']::text[] from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'nic', 'National Identity Card (NIC)', true, 'Owner or authorized signatory NIC copy', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'business_registration', 'Business Registration Certificate', true, 'Valid business registration proof', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'bank_statements_6m', 'Bank Statements (Last 6 Months)', true, 'Primary operating account statements', array['pdf']::text[] from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'financial_statements', 'Financial Statements', true, 'Latest management/accounting statements', array['pdf']::text[] from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'utility_bill', 'Utility Bill / Address Proof', false, 'Recent utility bill', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'nic', 'National Identity Card (NIC)', true, 'Owner or authorized signatory NIC copy', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'business_registration', 'Business Registration Certificate', true, 'Valid business registration proof', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'bank_statements_6m', 'Bank Statements (Last 6 Months)', true, 'Primary operating account statements', array['pdf']::text[] from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'financial_statements', 'Financial Statements', true, 'Latest management/accounting statements', array['pdf']::text[] from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'tax_returns', 'Tax Returns', false, 'Recent annual return or VAT records', array['pdf']::text[] from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'nic', 'National Identity Card (NIC)', true, 'Owner or authorized signatory NIC copy', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'ndb-araliya-sme'
union all
select id, 'business_registration', 'Business Registration Certificate', true, 'Valid business registration proof', array['pdf','jpg','png']::text[] from public.loan_products where slug = 'ndb-araliya-sme'
union all
select id, 'bank_statements_6m', 'Bank Statements (Last 6 Months)', true, 'Primary operating account statements', array['pdf']::text[] from public.loan_products where slug = 'ndb-araliya-sme'
union all
select id, 'financial_statements', 'Financial Statements', true, 'Audited statements preferred', array['pdf']::text[] from public.loan_products where slug = 'ndb-araliya-sme'
union all
select id, 'collateral_docs', 'Collateral Documents', true, 'Property or equipment security documents', array['pdf','jpg']::text[] from public.loan_products where slug = 'ndb-araliya-sme';

insert into public.benefits (product_id, title, description, is_highlight)
select id, 'Flexible repayment plans', 'Choose monthly installments aligned to business cash flow.', true from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'Dedicated SME desk', 'Support from relationship managers for document guidance.', true from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'No hidden charges', 'Transparent fee disclosure for all lending terms.', false from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'Quick approval lane', 'Short processing turnaround for standard eligibility cases.', true from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'Collateral waiver for small tickets', 'No collateral generally required up to low-mid ticket sizes.', true from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'Graceful onboarding support', 'Guided onboarding for first-time SME borrowers.', false from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'Competitive blended rates', 'Rate bands optimized for growing SME portfolios.', true from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'Longer tenure option', 'Extended repayment periods up to 84 months.', true from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'Relationship manager access', 'Commercial banking support for scaling businesses.', false from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'Sector advisory support', 'Industry-level guidance through HNB SME channels.', true from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'Structured installment options', 'Repayment profile can align with seasonal income.', true from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'Expansion focused lending', 'Tailored to business growth and modernization plans.', false from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'Digital-first process', 'Upload and track application progress online.', true from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'Fast document triage', 'Early document checks reduce underwriting delays.', true from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'Flexible top-up pathway', 'Eligible borrowers can apply for linked top-ups later.', false from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'Balanced pricing', 'Competitive pricing for SMEs in trade and services.', true from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'Streamlined verification', 'Simple documentation flow for common SME profiles.', true from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'Repayment support options', 'Case-by-case support in temporary cash flow stress.', false from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'Modernization funding', 'Supports machinery and technology upgrades.', true from public.loan_products where slug = 'ndb-araliya-sme'
union all
select id, 'Structured term flexibility', 'Flexible tenor within policy bounds for viable businesses.', true from public.loan_products where slug = 'ndb-araliya-sme'
union all
select id, 'Growth-stage advisory', 'Support for scaling and operational expansion.', false from public.loan_products where slug = 'ndb-araliya-sme';

insert into public.collateral (product_id, collateral_type, min_value_ratio, notes, is_optional)
select id, 'Property / Land', 1.20, 'Primary accepted security for larger ticket sizes.', false from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'Fixed Deposit', 1.00, 'Can be accepted as cash-backed collateral.', true from public.loan_products where slug = 'boc-sme-plus'
union all
select id, 'Personal Guarantee', null, 'Required for SME assist facility.', false from public.loan_products where slug = 'pb-sme-assist'
union all
select id, 'Property / Land', 1.25, 'Preferred for growth loans above LKR 10M.', false from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'Machinery', 1.10, 'Registered machinery may be considered as security.', true from public.loan_products where slug = 'combank-biz-growth-loan'
union all
select id, 'Property / Land', 1.20, 'Accepted under Shilpa policy for secured lending.', false from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'Vehicle', 1.10, 'Commercial vehicle ownership papers required.', true from public.loan_products where slug = 'hnb-shilpa-enterprise'
union all
select id, 'Personal Guarantee', null, 'Generally accepted when collateral is not mandatory.', false from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'Fixed Deposit', 1.00, 'Optional security to improve pricing.', true from public.loan_products where slug = 'sampath-vishwa-sme'
union all
select id, 'Personal Guarantee', null, 'Standard support for unsecured booster facilities.', false from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'Property / Land', 1.15, 'Optional collateral for larger exposure tiers.', true from public.loan_products where slug = 'seylan-sme-booster'
union all
select id, 'Property / Land', 1.20, 'Primary security for structured Araliya lending.', false from public.loan_products where slug = 'ndb-araliya-sme'
union all
select id, 'Machinery', 1.10, 'Machinery valuation required when used as collateral.', true from public.loan_products where slug = 'ndb-araliya-sme';

-- Optional helper: promote an existing profile to admin manually after first signup.
-- update public.profiles set is_admin = true where email = 'admin@yourdomain.com';
