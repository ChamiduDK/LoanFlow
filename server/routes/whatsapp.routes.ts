import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../lib/async-handler";
import { badRequest, unauthorized } from "../lib/errors";
import { logAudit } from "../services/audit.service";
import { twilioService } from "../services/twilio.service";
import { handleIncomingWhatsAppWebhook, handleVoiceCallTurn } from "../services/whatsapp-channel.service";

export const whatsappRouter = Router();

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
