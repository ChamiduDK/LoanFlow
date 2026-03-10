import { z } from "zod";
import { amountSchema, outcomeStatusSchema, uuidSchema } from "./common";

export const outcomeParamsSchema = z.object({
  id: uuidSchema,
});

export const upsertOutcomeSchema = z.object({
  status: outcomeStatusSchema,
  applied_date: z.string().date().optional(),
  decision_date: z.string().date().nullable().optional(),
  approved_amount: amountSchema.nullable().optional(),
  approved_rate: z.number().min(0).max(100).nullable().optional(),
  approved_tenure_months: z.number().int().min(1).max(360).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  consent_for_training: z.boolean().optional(),
});

export const updateOutcomeTrainingConsentSchema = z.object({
  consent_for_training: z.boolean(),
});

export const createInstallmentSchema = z.object({
  due_date: z.string().date(),
  amount: amountSchema,
  status: z.enum(["pending", "paid", "late"]).optional(),
  paid_date: z.string().date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.status === "paid" && !value.paid_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paid_date"],
      message: "paid_date is required when status is paid",
    });
  }
});

export const trackerParamsSchema = z.object({
  id: uuidSchema,
});
