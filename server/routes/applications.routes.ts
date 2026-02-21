import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import {
  applicationIdParamsSchema,
  createApplicationSchema,
  evaluateApplicationParamsSchema,
  evaluatePayloadSchema,
  updateApplicationSchema,
} from "../schemas/application";
import { requireAuth } from "../middleware/auth";
import { forbidden, internalError, notFound, unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { supabaseAdmin } from "../lib/supabase/client";
import { evaluateApplicationRecommendations, getStoredEvaluationResults } from "../services/evaluation.service";

export const applicationsRouter = Router();

applicationsRouter.use(requireAuth);

applicationsRouter.post(
  "/applications",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;
    if (!userId) {
      throw unauthorized();
    }

    const payload = parseWithSchema(createApplicationSchema, req.body);

    const { data, error } = await supabaseAdmin
      .from("loan_applications")
      .insert({
        user_id: userId,
        ...payload,
        status: payload.status ?? "draft",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to create application", error);
    }

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

    const existing = await supabaseAdmin
      .from("loan_applications")
      .select("id, user_id")
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

    const { data, error } = await supabaseAdmin
      .from("loan_applications")
      .update(payload)
      .eq("id", params.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to update application", error);
    }

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
