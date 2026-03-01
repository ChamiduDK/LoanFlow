import { z } from "zod";
import { amountSchema, uuidSchema } from "./common";

export const bankCreateSchema = z.object({
  name: z.string().min(2).max(180),
  code: z.string().min(2).max(20),
  website: z.string().url().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export const bankUpdateSchema = bankCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

const loanProductBaseSchema = z.object({
  bank_id: uuidSchema,
  name: z.string().min(2).max(180),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(2000).nullable().optional(),
  purpose_category: z.string().max(120).nullable().optional(),
  min_amount: amountSchema,
  max_amount: amountSchema,
  rate_min: z.number().min(0).max(100),
  rate_max: z.number().min(0).max(100),
  tenure_min_months: z.number().int().min(1).max(360),
  tenure_max_months: z.number().int().min(1).max(360),
  collateral_required: z.boolean().optional(),
  processing_days_min: z.number().int().min(1).max(365).nullable().optional(),
  processing_days_max: z.number().int().min(1).max(365).nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export const loanProductCreateSchema = loanProductBaseSchema
  .refine((value) => value.max_amount >= value.min_amount, {
    message: "max_amount must be greater than or equal to min_amount",
    path: ["max_amount"],
  })
  .refine((value) => value.rate_max >= value.rate_min, {
    message: "rate_max must be greater than or equal to rate_min",
    path: ["rate_max"],
  })
  .refine((value) => value.tenure_max_months >= value.tenure_min_months, {
    message: "tenure_max_months must be greater than or equal to tenure_min_months",
    path: ["tenure_max_months"],
  });

export const loanProductUpdateSchema = loanProductBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .refine((value) => {
    if (value.min_amount === undefined || value.max_amount === undefined) {
      return true;
    }
    return value.max_amount >= value.min_amount;
  }, {
    message: "max_amount must be greater than or equal to min_amount",
    path: ["max_amount"],
  })
  .refine((value) => {
    if (value.rate_min === undefined || value.rate_max === undefined) {
      return true;
    }
    return value.rate_max >= value.rate_min;
  }, {
    message: "rate_max must be greater than or equal to rate_min",
    path: ["rate_max"],
  })
  .refine((value) => {
    if (value.tenure_min_months === undefined || value.tenure_max_months === undefined) {
      return true;
    }
    return value.tenure_max_months >= value.tenure_min_months;
  }, {
    message: "tenure_max_months must be greater than or equal to tenure_min_months",
    path: ["tenure_max_months"],
  });

export const loanTermItemSchema = z
  .object({
    term_label: z.string().min(2).max(100),
    min_tenure_months: z.number().int().min(1).max(360),
    max_tenure_months: z.number().int().min(1).max(360),
    interest_rate_min: z.number().min(0).max(100),
    interest_rate_max: z.number().min(0).max(100),
    processing_fee_pct: z.number().min(0).max(100).nullable().optional(),
    late_fee_pct: z.number().min(0).max(100).nullable().optional(),
    prepayment_allowed: z.boolean().optional(),
    extra_terms: z.record(z.unknown()).nullable().optional(),
  })
  .refine((value) => value.max_tenure_months >= value.min_tenure_months, {
    message: "max_tenure_months must be >= min_tenure_months",
    path: ["max_tenure_months"],
  })
  .refine((value) => value.interest_rate_max >= value.interest_rate_min, {
    message: "interest_rate_max must be >= interest_rate_min",
    path: ["interest_rate_max"],
  });

export const upsertLoanTermsSchema = z.object({
  terms: z.array(loanTermItemSchema).min(1),
});

const eligibilityRuleSchema = z.object({
  min_years_active: z.number().int().min(0).max(100).optional(),
  allowed_business_types: z.array(z.string().min(1)).optional(),
  allowed_purposes: z.array(z.string().min(1)).optional(),
  min_turnover: z.number().min(0).optional(),
  allowed_turnover_bands: z.array(z.string().min(1)).optional(),
  max_amount_ratio_turnover: z.number().min(0).optional(),
  collateral_required: z.boolean().optional(),
  min_monthly_income: z.number().min(0).optional(),
  max_existing_obligations_ratio: z.number().min(0).max(1).optional(),
});

export const upsertEligibilityRuleSchema = z.object({
  rules_json: eligibilityRuleSchema,
  is_active: z.boolean().optional(),
});

const documentVerificationRulesSchema = z.object({
  required_keywords: z.array(z.string().min(1).max(120)).max(30).optional(),
  forbidden_keywords: z.array(z.string().min(1).max(120)).max(30).optional(),
  min_text_length: z.number().int().min(0).max(20000).optional(),
  ai_instructions: z.string().min(1).max(800).nullable().optional(),
});

export const requiredDocumentItemSchema = z.object({
  document_type: z.string().min(2).max(120),
  display_name: z.string().min(2).max(160),
  is_required: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
  accepted_formats: z.array(z.string().min(2).max(20)).optional(),
  verification_rules_json: documentVerificationRulesSchema.optional(),
});

export const upsertRequiredDocumentsSchema = z.object({
  documents: z.array(requiredDocumentItemSchema).min(1),
});

export const benefitItemSchema = z.object({
  title: z.string().min(2).max(180),
  description: z.string().max(500).nullable().optional(),
  is_highlight: z.boolean().optional(),
});

export const upsertBenefitsSchema = z.object({
  benefits: z.array(benefitItemSchema).min(1),
});

export const collateralItemSchema = z.object({
  collateral_type: z.string().min(2).max(120),
  min_value_ratio: z.number().min(0).max(5).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  is_optional: z.boolean().optional(),
});

export const upsertCollateralSchema = z.object({
  collateral: z.array(collateralItemSchema).min(1),
});

export const productByBankParamsSchema = z.object({
  id: uuidSchema,
});

export const productParamsSchema = z.object({
  id: uuidSchema,
});

export const productIdParamsSchema = z.object({
  productId: uuidSchema,
});
