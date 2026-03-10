import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireApprovedUser, requireAuth, requireFeatureAccess } from "../middleware/auth";
import { env } from "../config/env";
import { badRequest, internalError, unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { normalizeTelegramChatId } from "../lib/telegram";
import { normalizePhoneNumber } from "../lib/whatsapp";
import {
  agentContextParamsSchema,
  chatWebhookSchema,
  createAgentChatSessionSchema,
  linkTelegramSchema,
  linkWhatsappSchema,
  logAgentActionSchema,
  sendAgentChatMessageSchema,
} from "../schemas/agent";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "../services/audit.service";
import { getMissingDocumentsForApplication, getTrackerSummaryForAgent } from "../services/agent-tools.service";
import {
  createLoanFlowChatSession,
  getOrCreateLoanFlowChat,
  sendLoanFlowChatMessage,
} from "../services/loanflow-chat.service";

export const agentRouter = Router();

function stripSignaturePrefix(signature: string): string {
  return signature.replace(/^sha256=/i, "").trim().toLowerCase();
}

function verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const normalizedSignature = stripSignaturePrefix(signature);

  if (!/^[a-f0-9]{64}$/i.test(normalizedSignature)) {
    return false;
  }

  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const received = Buffer.from(normalizedSignature, "hex");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

agentRouter.post(
  "/agent/chat/webhook",
  asyncHandler(async (req, res) => {
    if (!env.AGENT_WEBHOOK_SECRET) {
      throw internalError("AGENT_WEBHOOK_SECRET is not configured");
    }

    const signature = req.header("x-agent-signature");
    if (!signature) {
      throw badRequest("Missing x-agent-signature header");
    }

    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const signatureValid = verifyWebhookSignature(rawBody, signature, env.AGENT_WEBHOOK_SECRET);

    if (!signatureValid) {
      throw unauthorized("Invalid agent webhook signature");
    }

    const payload = parseWithSchema(chatWebhookSchema, req.body);

    sendSuccess(res, {
      accepted: true,
      note: "Webhook authenticated and accepted",
      event_type: payload.event_type,
    });
  }),
);

agentRouter.use(requireAuth, requireApprovedUser);

agentRouter.get(
  "/agent/chat/session",
  requireFeatureAccess("ai_chat"),
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;
    if (!userId) {
      throw unauthorized();
    }

    const session = await getOrCreateLoanFlowChat(userId);
    sendSuccess(res, session);
  }),
);

agentRouter.post(
  "/agent/chat/session",
  requireFeatureAccess("ai_chat"),
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;
    if (!userId) {
      throw unauthorized();
    }

    const payload = parseWithSchema(createAgentChatSessionSchema, req.body ?? {});
    const session = await createLoanFlowChatSession(userId, payload.application_id);
    sendSuccess(res, session, undefined, 201);
  }),
);

agentRouter.post(
  "/agent/chat/message",
  requireFeatureAccess("ai_chat"),
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;
    if (!userId) {
      throw unauthorized();
    }

    const payload = parseWithSchema(sendAgentChatMessageSchema, req.body ?? {});
    const response = await sendLoanFlowChatMessage(userId, payload);
    sendSuccess(res, response, undefined, 201);
  }),
);

agentRouter.post(
  "/agent/link-whatsapp",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(linkWhatsappSchema, req.body);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const normalizedPhone = normalizePhoneNumber(payload.phone_number);

    const { data, error } = await supabaseAdmin
      .from("user_channel_links")
      .upsert(
        {
          user_id: userId,
          channel_type: "whatsapp",
          channel_user_id: normalizedPhone,
          is_verified: false,
          metadata: {
            link_state: "pending_verification",
            normalized_phone: normalizedPhone,
            requested_at: new Date().toISOString(),
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
        normalized_phone: normalizedPhone,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, {
      link_id: data.id,
      status: "pending_verification",
      phone_number: normalizedPhone,
      instructions:
        env.WHATSAPP_PROVIDER === "whatsapp_web"
          ? "Start the local LoanFlow WhatsApp Web client, scan the QR code, and send a WhatsApp message from this number. Verification will complete on the first inbound message."
          : "Send a WhatsApp message from this number to the configured LoanFlow Twilio number. Verification will complete on the first inbound message.",
    });
  }),
);

agentRouter.post(
  "/agent/link-telegram",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(linkTelegramSchema, req.body);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const normalizedChatId = normalizeTelegramChatId(payload.chat_id);
    const { data, error } = await supabaseAdmin
      .from("user_channel_links")
      .upsert(
        {
          user_id: userId,
          channel_type: "telegram",
          channel_user_id: normalizedChatId,
          is_verified: false,
          metadata: {
            link_state: "pending_verification",
            telegram_chat_id: normalizedChatId,
            requested_at: new Date().toISOString(),
          },
        },
        {
          onConflict: "user_id,channel_type",
        },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to start Telegram link flow", error);
    }

    await logAudit({
      actorUserId: userId,
      action: "agent.link_telegram.started",
      entityType: "user_channel_links",
      entityId: String(data.id),
      payloadSummary: {
        chat_id: normalizedChatId,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, {
      link_id: data.id,
      status: "pending_verification",
      chat_id: normalizedChatId,
      instructions:
        "Open the LoanFlow Telegram bot and send any private message from this chat. Verification will complete on the first inbound message.",
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
