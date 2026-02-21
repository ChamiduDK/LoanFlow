import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import { unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { createInstallmentSchema, trackerParamsSchema } from "../schemas/outcome";
import { addInstallment, getTrackerSummary, listInstallments } from "../services/tracker.service";
import { logAudit } from "../services/audit.service";

export const trackerRouter = Router();

trackerRouter.use(requireAuth);

trackerRouter.get(
  "/applications/:id/tracker",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(trackerParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const summary = await getTrackerSummary(userId, params.id);
    sendSuccess(res, summary);
  }),
);

trackerRouter.post(
  "/applications/:id/tracker/installments",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(trackerParamsSchema, req.params);
    const payload = parseWithSchema(createInstallmentSchema, req.body);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const installment = await addInstallment(userId, params.id, payload);

    await logAudit({
      actorUserId: userId,
      action: "tracker.installment.added",
      entityType: "installments",
      entityId: String(installment.id),
      payloadSummary: {
        applicationId: params.id,
        amount: payload.amount,
        dueDate: payload.due_date,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, installment, undefined, 201);
  }),
);

trackerRouter.get(
  "/applications/:id/tracker/installments",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(trackerParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const installments = await listInstallments(userId, params.id);

    sendSuccess(res, installments);
  }),
);
