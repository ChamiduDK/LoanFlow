import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireAdmin, requireApprovedUser, requireAuth } from "../middleware/auth";
import { unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { outcomeParamsSchema, updateOutcomeTrainingConsentSchema, upsertOutcomeSchema } from "../schemas/outcome";
import { getOutcome, updateOutcomeTrainingConsent, upsertOutcome } from "../services/outcome.service";

export const outcomeRouter = Router();

outcomeRouter.post(
  "/applications/:id/outcome",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(outcomeParamsSchema, req.params);
    const payload = parseWithSchema(upsertOutcomeSchema, req.body);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const result = await upsertOutcome(userId, params.id, payload, req.ip);

    sendSuccess(res, result, undefined, 201);
  }),
);

outcomeRouter.get(
  "/applications/:id/outcome",
  requireAuth,
  requireApprovedUser,
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(outcomeParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const outcome = await getOutcome(userId, params.id);
    sendSuccess(res, outcome);
  }),
);

outcomeRouter.post(
  "/applications/:id/outcome/training-consent",
  requireAuth,
  requireApprovedUser,
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(outcomeParamsSchema, req.params);
    const payload = parseWithSchema(updateOutcomeTrainingConsentSchema, req.body ?? {});
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const outcome = await updateOutcomeTrainingConsent(
      userId,
      params.id,
      payload.consent_for_training,
      req.ip,
    );

    sendSuccess(res, outcome);
  }),
);
