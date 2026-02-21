import { z } from "zod";
import { amountSchema, appStatusSchema, uuidSchema } from "./common";

export const createApplicationSchema = z.object({
  requested_amount: amountSchema,
  purpose: z.string().min(2).max(200),
  preferred_tenure_months: z.number().int().min(1).max(360),
  collateral_available: z.boolean(),
  collateral_type: z.string().min(2).max(120).nullable().optional(),
  profile_snapshot: z.record(z.unknown()).nullable().optional(),
  business_context: z.record(z.unknown()).nullable().optional(),
  selected_product_id: uuidSchema.nullable().optional(),
  status: appStatusSchema.optional(),
});

export const updateApplicationSchema = createApplicationSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const applicationIdParamsSchema = z.object({
  id: uuidSchema,
});

export const evaluateApplicationParamsSchema = z.object({
  id: uuidSchema,
});

export const evaluatePayloadSchema = z.object({
  selected_product_id: uuidSchema.optional(),
  persist_rank: z.boolean().optional(),
});
