import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler";
import { badRequest, unauthorized } from "../lib/errors";
import { normalizePhoneNumber } from "../lib/whatsapp";
import { parseWithSchema } from "../lib/validation";
import { logAudit } from "../services/audit.service";
import { isTwilioWhatsAppProvider, isWhatsAppWebProvider } from "../services/whatsapp-messaging.service";
import { twilioService } from "../services/twilio.service";
import { supabaseAdmin } from "../lib/supabase/client";
import {
  handleIncomingWhatsAppWebhook,
  handleVoiceCallTurn,
  simulateIncomingWhatsAppAudio,
  simulateIncomingWhatsAppDocument,
  simulateIncomingWhatsAppText,
} from "../services/whatsapp-channel.service";
import { env } from "../config/env";

export const whatsappRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const devTextSchema = z.object({
  from: z.string().min(7).max(30),
  body: z.string().min(1).max(3000),
});

const devLinkSchema = z.object({
  phone_number: z.string().min(7).max(30),
  user_id: z.string().uuid().optional(),
  email: z.string().email().optional(),
}).refine((value) => Boolean(value.user_id || value.email), {
  message: "Either user_id or email is required",
});

const devVoiceSchema = z.object({
  from: z.string().min(7).max(30),
  body: z.string().max(1000).optional(),
});

const devCallSchema = z.object({
  from: z.string().min(7).max(30),
  speechResult: z.string().min(1).max(3000),
});

function assertLocalDevAllowed(): void {
  if (env.NODE_ENV === "production") {
    throw unauthorized("Local simulation endpoints are disabled in production");
  }
}

function assertTwilioProvider(): void {
  if (!isTwilioWhatsAppProvider()) {
    throw badRequest("Twilio webhook routes are disabled unless WHATSAPP_PROVIDER=twilio");
  }
}

function assertWhatsAppWebProvider(): void {
  if (!isWhatsAppWebProvider()) {
    throw badRequest("WhatsApp Web routes are disabled unless WHATSAPP_PROVIDER=whatsapp_web");
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function gatherTwiml(prompt: string): string {
  const escapedPrompt = escapeXml(prompt);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" method="POST" action="/api/whatsapp/twilio/voice/process" language="en-US" speechTimeout="auto">
    <Say>${escapedPrompt}</Say>
  </Gather>
  <Say>I did not catch that. Please try again.</Say>
  <Redirect method="POST">/api/whatsapp/twilio/voice</Redirect>
</Response>`;
}

function continueCallTwiml(reply: string): string {
  const escapedReply = escapeXml(reply);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapedReply}</Say>
  <Pause length="1"/>
  <Gather input="speech" method="POST" action="/api/whatsapp/twilio/voice/process" language="en-US" speechTimeout="auto">
    <Say>You can ask another question now.</Say>
  </Gather>
  <Say>Thank you for calling LoanFlow. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function assertTwilioSignature(req: Request): void {
  assertTwilioProvider();
  const valid = twilioService.verifySignature(req);
  if (!valid) {
    throw unauthorized("Invalid Twilio signature");
  }
}

whatsappRouter.post(
  "/whatsapp/twilio/webhook",
  asyncHandler(async (req, res) => {
    assertTwilioSignature(req);
    await handleIncomingWhatsAppWebhook((req.body ?? {}) as Record<string, unknown>, req.ip);
    res.status(200).send("OK");
  }),
);

whatsappRouter.post(
  "/whatsapp/twilio/status",
  asyncHandler(async (req, res) => {
    assertTwilioSignature(req);

    await logAudit({
      action: "whatsapp.delivery.status",
      entityType: "messages",
      payloadSummary: {
        message_sid: req.body?.MessageSid ?? null,
        message_status: req.body?.MessageStatus ?? null,
        error_code: req.body?.ErrorCode ?? null,
      },
      ipAddress: req.ip,
    });

    res.status(200).send("OK");
  }),
);

whatsappRouter.post(
  "/whatsapp/twilio/voice",
  asyncHandler(async (req, res) => {
    assertTwilioSignature(req);

    const twiml = gatherTwiml(
      "Welcome to LoanFlow SME Assistant. Please tell me your loan question after the tone.",
    );
    res.type("text/xml").status(200).send(twiml);
  }),
);

whatsappRouter.post(
  "/whatsapp/twilio/voice/process",
  asyncHandler(async (req: Request, res: Response) => {
    assertTwilioSignature(req);

    const caller = String(req.body?.From ?? "").trim();
    const speechResult = String(req.body?.SpeechResult ?? "").trim();

    if (!caller) {
      throw badRequest("Missing caller identity for voice webhook");
    }

    const reply = await handleVoiceCallTurn({
      from: caller,
      speechResult,
      ipAddress: req.ip,
    });

    const twiml = continueCallTwiml(reply);
    res.type("text/xml").status(200).send(twiml);
  }),
);

whatsappRouter.post(
  "/whatsapp/dev/link",
  asyncHandler(async (req, res) => {
    assertLocalDevAllowed();
    const payload = parseWithSchema(devLinkSchema, req.body ?? {});

    const profileQuery = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .limit(1);

    const profileResult = payload.user_id
      ? await profileQuery.eq("id", payload.user_id).maybeSingle()
      : await profileQuery.eq("email", payload.email ?? "").maybeSingle();

    if (profileResult.error) {
      throw badRequest("Failed to load target profile", profileResult.error);
    }

    if (!profileResult.data) {
      throw badRequest("Target profile not found");
    }

    const normalizedPhone = normalizePhoneNumber(payload.phone_number);
    const upsertResult = await supabaseAdmin
      .from("user_channel_links")
      .upsert(
        {
          user_id: String(profileResult.data.id),
          channel_type: "whatsapp",
          channel_user_id: normalizedPhone,
          is_verified: true,
          metadata: {
            linked_via: "localhost_dev_endpoint",
            linked_at: new Date().toISOString(),
          },
        },
        { onConflict: "user_id,channel_type" },
      )
      .select("id, user_id, channel_type, channel_user_id, is_verified, metadata")
      .single();

    if (upsertResult.error || !upsertResult.data) {
      throw badRequest("Failed to create localhost WhatsApp link", upsertResult.error);
    }

    res.status(200).json({
      success: true,
      data: {
        link: upsertResult.data,
        profile: profileResult.data,
      },
    });
  }),
);

whatsappRouter.get(
  "/whatsapp/web/status",
  asyncHandler(async (_req, res) => {
    assertLocalDevAllowed();
    assertWhatsAppWebProvider();
    const { whatsappWebService } = await import("../services/whatsapp-web.service");
    res.status(200).json({
      success: true,
      data: whatsappWebService.getStatus(),
    });
  }),
);

whatsappRouter.post(
  "/whatsapp/web/start",
  asyncHandler(async (_req, res) => {
    assertLocalDevAllowed();
    assertWhatsAppWebProvider();
    const { whatsappWebService } = await import("../services/whatsapp-web.service");
    await whatsappWebService.initialize();
    res.status(200).json({
      success: true,
      data: whatsappWebService.getStatus(),
    });
  }),
);

whatsappRouter.post(
  "/whatsapp/dev/simulate/text",
  asyncHandler(async (req, res) => {
    assertLocalDevAllowed();
    const payload = parseWithSchema(devTextSchema, req.body ?? {});
    const result = await simulateIncomingWhatsAppText({
      from: payload.from,
      body: payload.body,
      ipAddress: req.ip,
    });
    res.status(200).json({ success: true, data: result });
  }),
);

whatsappRouter.post(
  "/whatsapp/dev/simulate/voice",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    assertLocalDevAllowed();
    const payload = parseWithSchema(devVoiceSchema, req.body ?? {});
    if (!req.file) {
      throw badRequest("Missing file input. Expected multipart field 'file'");
    }

    const result = await simulateIncomingWhatsAppAudio({
      from: payload.from,
      body: payload.body,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      ipAddress: req.ip,
    });
    res.status(200).json({ success: true, data: result });
  }),
);

whatsappRouter.post(
  "/whatsapp/dev/simulate/document",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    assertLocalDevAllowed();
    const payload = parseWithSchema(devVoiceSchema, req.body ?? {});
    if (!req.file) {
      throw badRequest("Missing file input. Expected multipart field 'file'");
    }

    const result = await simulateIncomingWhatsAppDocument({
      from: payload.from,
      body: payload.body,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      ipAddress: req.ip,
    });
    res.status(200).json({ success: true, data: result });
  }),
);

whatsappRouter.post(
  "/whatsapp/dev/simulate/call",
  asyncHandler(async (req, res) => {
    assertLocalDevAllowed();
    const payload = parseWithSchema(devCallSchema, req.body ?? {});
    const reply = await handleVoiceCallTurn({
      from: payload.from,
      speechResult: payload.speechResult,
      ipAddress: req.ip,
    });
    res.status(200).json({
      success: true,
      data: {
        replyText: reply,
      },
    });
  }),
);
