import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import { badRequest, internalError, unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import {
  agentContextParamsSchema,
  chatWebhookSchema,
  linkWhatsappSchema,
  logAgentActionSchema,
} from "../schemas/agent";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "../services/audit.service";
import { getMissingDocumentsForApplication, getTrackerSummaryForAgent } from "../services/agent-tools.service";

export const agentRouter = Router();

agentRouter.post(
  "/agent/chat/webhook",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(chatWebhookSchema, req.body);

    const signature = req.header("x-agent-signature");
    if (!signature) {
      throw badRequest("Missing x-agent-signature header");
    }

    sendSuccess(res, {
      accepted: true,
      note: "Webhook accepted by placeholder handler",
      event_type: payload.event_type,
    });
  }),
);

agentRouter.use(requireAuth);

agentRouter.post(
  "/agent/link-whatsapp",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(linkWhatsappSchema, req.body);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const { data, error } = await supabaseAdmin
      .from("user_channel_links")
      .upsert(
        {
          user_id: userId,
          channel_type: "whatsapp",
          channel_user_id: payload.phone_number,
          is_verified: false,
          metadata: {
            link_state: "pending_verification",
          },
        },
        {
          onConflict: "user_id,channel_type",
        },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to start WhatsApp link flow", error);
    }

    await logAudit({
      actorUserId: userId,
      action: "agent.link_whatsapp.started",
      entityType: "user_channel_links",
      entityId: String(data.id),
      payloadSummary: {
        phone_number: payload.phone_number,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, {
      link_id: data.id,
      status: "pending_verification",
      instructions: "Use OTP verification flow in upcoming WhatsApp integration phase",
    });
  }),
);

agentRouter.get(
  "/agent/context/:applicationId",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(agentContextParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const [applicationResult, profileResult, recommendationResult, missingDocsResult, trackerResult] = await Promise.all([
      supabaseAdmin
        .from("loan_applications")
        .select("id, requested_amount, purpose, preferred_tenure_months, status, selected_product_id")
        .eq("id", params.applicationId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, business_name, business_type, industry, years_active, annual_turnover")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("application_results")
        .select("*")
        .eq("application_id", params.applicationId)
        .order("rank_position", { ascending: true })
        .limit(3),
      getMissingDocumentsForApplication(userId, params.applicationId),
      getTrackerSummaryForAgent(userId, params.applicationId),
    ]);

    if (applicationResult.error || !applicationResult.data) {
      throw badRequest("Application not found or inaccessible");
    }

    if (profileResult.error) {
      throw internalError("Failed to load profile context", profileResult.error);
    }

    if (recommendationResult.error) {
      throw internalError("Failed to load recommendation context", recommendationResult.error);
    }

    sendSuccess(res, {
      application: applicationResult.data,
      profile: profileResult.data,
      top_recommendations: recommendationResult.data ?? [],
      missing_documents: missingDocsResult,
      tracker_summary: trackerResult,
    });
  }),
);

agentRouter.post(
  "/agent/actions/log",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(logAgentActionSchema, req.body);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const { data, error } = await supabaseAdmin
      .from("agent_actions")
      .insert({
        user_id: userId,
        application_id: payload.application_id ?? null,
        action_type: payload.action_type,
        action_payload: payload.action_payload ?? {},
        action_status: payload.action_status ?? "logged",
        result_json: payload.result_json ?? {},
      })
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to log agent action", error);
    }

    await logAudit({
      actorUserId: userId,
      action: "agent.action.logged",
      entityType: "agent_actions",
      entityId: String(data.id),
      payloadSummary: {
        action_type: payload.action_type,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, data, undefined, 201);
  }),
);
