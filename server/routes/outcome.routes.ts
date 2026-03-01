import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireApprovedUser, requireAuth } from "../middleware/auth";
import { unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { outcomeParamsSchema, upsertOutcomeSchema } from "../schemas/outcome";
import { getOutcome, upsertOutcome } from "../services/outcome.service";

export const outcomeRouter = Router();

outcomeRouter.use(requireAuth, requireApprovedUser);

outcomeRouter.post(
  "/applications/:id/outcome",
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
