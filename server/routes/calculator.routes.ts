import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { emiCalculatorSchema } from "../schemas/calculator";
import { sendSuccess } from "../lib/response";
import { calculateEmi, estimateEmiRange } from "../services/emi.service";
import { formatLkr } from "../lib/format";

export const calculatorRouter = Router();

calculatorRouter.post(
  "/calculator/emi",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(emiCalculatorSchema, req.body);

    const emi = calculateEmi(payload.principal, payload.annual_rate, payload.tenure_months);

    const range =
      payload.min_rate !== undefined &&
      payload.max_rate !== undefined &&
      payload.min_tenure_months !== undefined &&
      payload.max_tenure_months !== undefined
        ? estimateEmiRange(
            payload.principal,
            payload.min_rate,
            payload.max_rate,
            payload.min_tenure_months,
            payload.max_tenure_months,
          )
        : null;

    const includeFormatted = payload.include_formatted ?? true;

    sendSuccess(res, {
      emi,
      range,
      ...(includeFormatted
        ? {
            formatted: {
              monthly_emi: formatLkr(emi.monthlyEmi),
              total_interest: formatLkr(emi.totalInterest),
              total_payable: formatLkr(emi.totalPayable),
              ...(range
                ? {
                    min_emi: formatLkr(range.minEmi),
                    max_emi: formatLkr(range.maxEmi),
                  }
                : {}),
            },
          }
        : {}),
    });
  }),
);
