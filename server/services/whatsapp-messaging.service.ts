import { env } from "../config/env";
import { internalError } from "../lib/errors";
import { twilioService } from "./twilio.service";

export type OutboundWhatsAppMessage = {
  to: string;
  body: string;
  mediaUrl?: string;
};

export function isTwilioWhatsAppProvider(): boolean {
  return env.WHATSAPP_PROVIDER === "twilio";
}

export function isWhatsAppWebProvider(): boolean {
  return env.WHATSAPP_PROVIDER === "whatsapp_web";
}

export async function sendWhatsAppMessage(input: OutboundWhatsAppMessage): Promise<void> {
  if (isTwilioWhatsAppProvider()) {
    await twilioService.sendMessage(input);
    return;
  }

  if (isWhatsAppWebProvider()) {
    const { whatsappWebService } = await import("./whatsapp-web.service");
    await whatsappWebService.sendMessage(input);
    return;
  }

  throw internalError("WhatsApp provider is disabled");
}
