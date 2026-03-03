import { z } from "zod";
import { outcomeStatusSchema, uuidSchema } from "./common";

const accessTokenSchema = z
  .string()
  .min(24)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid access token format");

const pinCodeSchema = z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits");

export const bankAgentAccessParamsSchema = z.object({
  id: uuidSchema,
});

export const createBankAgentAccessSchema = z.object({
  expires_in_hours: z.number().int().min(1).max(24 * 30).optional(),
});

export const verifyBankAgentAccessSchema = z.object({
  token: accessTokenSchema,
  pin_code: pinCodeSchema,
});

export const bankAgentOutcomeUpdateSchema = z.object({
  token: accessTokenSchema,
  pin_code: pinCodeSchema,
  status: outcomeStatusSchema,
  applied_date: z.string().date().optional(),
  decision_date: z.string().date().nullable().optional(),
  approved_amount: z.number().positive().max(1_000_000_000).nullable().optional(),
  approved_rate: z.number().min(0).max(100).nullable().optional(),
  approved_tenure_months: z.number().int().min(1).max(360).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  consent_for_training: z.boolean().optional(),
});
