import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import {
  applicationIdParamsSchema,
  createApplicationSchema,
  evaluateApplicationParamsSchema,
  evaluatePayloadSchema,
  trackApplicationSchema,
  updateApplicationSchema,
} from "../schemas/application";
import { requireApprovedUser, requireAuth } from "../middleware/auth";
import { forbidden, internalError, notFound, unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { supabaseAdmin } from "../lib/supabase/client";
import { evaluateApplicationRecommendations, getStoredEvaluationResults } from "../services/evaluation.service";
import { logAudit } from "../services/audit.service";
import { startApplicationTracking } from "../services/tracking.service";
import { generateProposalBodySchema, proposalParamsSchema } from "../schemas/proposal";
import { generateLoanProposal, getLatestLoanProposal } from "../services/proposal.service";
import { getLoanManagementSummary } from "../services/loan-management.service";

export const applicationsRouter = Router();

applicationsRouter.use(requireAuth, requireApprovedUser);

const submittedStatuses = new Set([
  "submitted",
  "evaluated",
  "applied",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
]);
const restrictedUserStatuses = new Set(["under_review", "approved", "rejected"]);

applicationsRouter.post(
  "/applications",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;
    if (!userId) {
      throw unauthorized();
    }

    const payload = parseWithSchema(createApplicationSchema, req.body);

    if (payload.status && restrictedUserStatuses.has(payload.status)) {
      throw forbidden("Selected status is restricted to admin workflows");
    }

    const status = payload.status ?? "draft";
    const submittedAt = submittedStatuses.has(status) ? new Date().toISOString() : null;

    const { data, error } = await supabaseAdmin
      .from("loan_applications")
      .insert({
        user_id: userId,
        ...payload,
        status,
        submitted_at: submittedAt,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to create application", error);
    }

    await logAudit({
      actorUserId: userId,
      action: "application.created",
      entityType: "loan_applications",
      entityId: String(data.id),
      payloadSummary: {
        requested_amount: data.requested_amount,
        status: data.status,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, data, undefined, 201);
  }),
);

applicationsRouter.get(
  "/applications",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;
    if (!userId) {
      throw unauthorized();
    }

    const { data, error } = await supabaseAdmin
      .from("loan_applications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw internalError("Failed to fetch applications", error);
    }

    sendSuccess(res, data ?? []);
  }),
);

applicationsRouter.get(
  "/applications/:id",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(applicationIdParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const { data, error } = await supabaseAdmin
      .from("loan_applications")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      throw internalError("Failed to load application", error);
    }

    if (!data) {
      throw notFound("Application not found");
    }

    if (data.user_id !== userId) {
      throw forbidden("You cannot access this application");
    }

    sendSuccess(res, data);
  }),
);

applicationsRouter.put(
  "/applications/:id",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(applicationIdParamsSchema, req.params);
    const payload = parseWithSchema(updateApplicationSchema, req.body);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    if (payload.status && restrictedUserStatuses.has(payload.status)) {
      throw forbidden("Selected status is restricted to admin workflows");
    }

    const existing = await supabaseAdmin
      .from("loan_applications")
      .select("id, user_id, status, submitted_at")
      .eq("id", params.id)
      .maybeSingle();

    if (existing.error) {
      throw internalError("Failed to load application", existing.error);
    }

    if (!existing.data) {
      throw notFound("Application not found");
    }

    if (existing.data.user_id !== userId) {
      throw forbidden("You cannot update this application");
    }

    const updatePayload: Record<string, unknown> = { ...payload };
    if (
      payload.status &&
      submittedStatuses.has(payload.status) &&
      !existing.data.submitted_at
    ) {
      updatePayload.submitted_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("loan_applications")
      .update(updatePayload)
      .eq("id", params.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to update application", error);
    }

    await logAudit({
      actorUserId: userId,
      action: "application.updated",
      entityType: "loan_applications",
      entityId: params.id,
      payloadSummary: payload as Record<string, unknown>,
      ipAddress: req.ip,
    });

    sendSuccess(res, data);
  }),
);

applicationsRouter.post(
  "/applications/:id/evaluate",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(evaluateApplicationParamsSchema, req.params);
    parseWithSchema(evaluatePayloadSchema, req.body ?? {});

    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const result = await evaluateApplicationRecommendations(userId, params.id, req.ip);

    sendSuccess(res, result);
  }),
);

applicationsRouter.get(
  "/applications/:id/evaluation",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(evaluateApplicationParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const result = await getStoredEvaluationResults(userId, params.id);

    sendSuccess(res, result);
  }),
);

applicationsRouter.post(
  "/applications/:id/track",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(applicationIdParamsSchema, req.params);
    const payload = parseWithSchema(trackApplicationSchema, req.body ?? {});
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const result = await startApplicationTracking(
      userId,
      params.id,
      payload.productId,
      req.ip,
    );

    sendSuccess(res, result);
  }),
);

applicationsRouter.post(
  "/applications/:id/proposal/generate",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(proposalParamsSchema, req.params);
    const payload = parseWithSchema(generateProposalBodySchema, req.body ?? {});
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const proposal = await generateLoanProposal(
      userId,
      params.id,
      payload.product_id,
      req.ip,
    );

    sendSuccess(res, proposal, undefined, 201);
  }),
);

applicationsRouter.get(
  "/applications/:id/proposal",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(proposalParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const proposal = await getLatestLoanProposal(userId, params.id);
    sendSuccess(res, proposal);
  }),
);

applicationsRouter.get(
  "/applications/:id/loan-management",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(proposalParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const summary = await getLoanManagementSummary(userId, params.id);
    sendSuccess(res, summary);
  }),
);
