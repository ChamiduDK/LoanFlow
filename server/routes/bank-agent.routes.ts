import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { sendSuccess } from "../lib/response";
import { requireApprovedUser, requireAuth } from "../middleware/auth";
import { unauthorized } from "../lib/errors";
import { authRateLimiter } from "../middleware/rate-limiter";
import {
  bankAgentAccessParamsSchema,
  bankAgentOutcomeUpdateSchema,
  createBankAgentAccessSchema,
  verifyBankAgentAccessSchema,
} from "../schemas/bank-agent";
import {
  createBankAgentAccessGrant,
  updateOutcomeByBankAgentAccess,
  verifyBankAgentAccess,
} from "../services/bank-agent-access.service";

export const bankAgentRouter = Router();

bankAgentRouter.post(
  "/bank-agent/access/verify",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(verifyBankAgentAccessSchema, req.body ?? {});
    const result = await verifyBankAgentAccess(payload.token, payload.pin_code);
    sendSuccess(res, result);
  }),
);

bankAgentRouter.post(
  "/bank-agent/access/outcome",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(bankAgentOutcomeUpdateSchema, req.body ?? {});
    const result = await updateOutcomeByBankAgentAccess(
      payload.token,
      payload.pin_code,
      {
        status: payload.status,
        applied_date: payload.applied_date,
        decision_date: payload.decision_date,
        approved_amount: payload.approved_amount,
        approved_rate: payload.approved_rate,
        approved_tenure_months: payload.approved_tenure_months,
        notes: payload.notes,
        consent_for_training: payload.consent_for_training,
      },
      req.ip,
    );

    sendSuccess(res, result, undefined, 201);
  }),
);

bankAgentRouter.post(
  "/applications/:id/bank-agent-access",
  requireAuth,
  requireApprovedUser,
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(bankAgentAccessParamsSchema, req.params);
    const payload = parseWithSchema(createBankAgentAccessSchema, req.body ?? {});
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const grant = await createBankAgentAccessGrant(
      userId,
      params.id,
      payload.expires_in_hours ?? 72,
      req.ip,
    );

    sendSuccess(res, grant, undefined, 201);
  }),
);
