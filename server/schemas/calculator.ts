import { z } from "zod";
import { amountSchema } from "./common";

export const emiCalculatorSchema = z
  .object({
    principal: amountSchema,
    annual_rate: z.number().min(0).max(100),
    tenure_months: z.number().int().min(1).max(360),
    min_rate: z.number().min(0).max(100).optional(),
    max_rate: z.number().min(0).max(100).optional(),
    min_tenure_months: z.number().int().min(1).max(360).optional(),
    max_tenure_months: z.number().int().min(1).max(360).optional(),
    include_formatted: z.boolean().optional(),
  })
  .refine((value) => {
    if (value.min_rate === undefined || value.max_rate === undefined) {
      return true;
    }
    return value.max_rate >= value.min_rate;
  }, {
    message: "max_rate must be greater than or equal to min_rate",
    path: ["max_rate"],
  })
  .refine((value) => {
    if (value.min_tenure_months === undefined || value.max_tenure_months === undefined) {
      return true;
    }
    return value.max_tenure_months >= value.min_tenure_months;
  }, {
    message: "max_tenure_months must be greater than or equal to min_tenure_months",
    path: ["max_tenure_months"],
  });
