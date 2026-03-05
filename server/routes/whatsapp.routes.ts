import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler";
import { badRequest, unauthorized } from "../lib/errors";
import { parseWithSchema } from "../lib/validation";
import { logAudit } from "../services/audit.service";
import { twilioService } from "../services/twilio.service";
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
