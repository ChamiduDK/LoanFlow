import { z } from "zod";
import { turnoverBandSchema } from "./common";

export const updateProfileSchema = z
  .object({
    full_name: z.string().min(2).max(120).nullable().optional(),
    phone: z.string().min(7).max(30).nullable().optional(),
    district: z.string().min(2).max(120).nullable().optional(),
    business_name: z.string().min(2).max(160).nullable().optional(),
    business_type: z.string().min(2).max(120).nullable().optional(),
    industry: z.string().min(2).max(120).nullable().optional(),
    years_active: z.number().int().min(0).max(100).nullable().optional(),
    annual_turnover: z.number().min(0).nullable().optional(),
    monthly_income: z.number().min(0).nullable().optional(),
    monthly_expenses: z.number().min(0).nullable().optional(),
    existing_loan_obligations: z.number().min(0).nullable().optional(),
    turnover_band: turnoverBandSchema.nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required",
  });
