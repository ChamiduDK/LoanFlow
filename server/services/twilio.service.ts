import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env";
import { badRequest, internalError, unauthorized } from "../lib/errors";

type TwilioMessageInput = {
  to: string;
  body: string;
  mediaUrl?: string;
};

type DownloadedMedia = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
};

function normalizeWhatsAppAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("whatsapp:")) {
    return trimmed;
  }

  return `whatsapp:${trimmed}`;
}

function sanitizeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildWebhookUrl(req: Request): string {
  if (env.TWILIO_WEBHOOK_BASE_URL) {
    return new URL(req.originalUrl, env.TWILIO_WEBHOOK_BASE_URL).toString();
  }

  const host = req.get("host");
  if (!host) {
    throw badRequest("Missing host header");
  }

  return `${req.protocol}://${host}${req.originalUrl}`;
}

function appendParam(input: string, key: string, value: unknown): string {
  if (value == null) return input;
  if (Array.isArray(value)) {
    const sorted = [...value].map((item) => String(item)).sort();
    return sorted.reduce((acc, item) => `${acc}${key}${item}`, input);
  }

  return `${input}${key}${String(value)}`;
}

function verifySignature(req: Request): boolean {
  if (!env.TWILIO_VERIFY_SIGNATURE) {
    return true;
  }

  if (!env.TWILIO_AUTH_TOKEN) {
    throw internalError("TWILIO_AUTH_TOKEN is not configured");
  }

  const signature = req.header("x-twilio-signature");
  if (!signature) {
    return false;
  }

  const url = buildWebhookUrl(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sortedKeys = Object.keys(body).sort();
  const payload = sortedKeys.reduce((acc, key) => appendParam(acc, key, body[key]), url);

  const digest = createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(payload).digest("base64");

  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

function assertMessagingConfigured() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM_NUMBER) {
    throw internalError("Twilio WhatsApp credentials are not fully configured");
  }
}

async function sendMessage(input: TwilioMessageInput): Promise<void> {
  assertMessagingConfigured();

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams({
    To: normalizeWhatsAppAddress(input.to),
    From: normalizeWhatsAppAddress(env.TWILIO_WHATSAPP_FROM_NUMBER!),
    Body: input.body,
  });

  if (input.mediaUrl) {
    form.append("MediaUrl", input.mediaUrl);
  }

  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw internalError("Twilio message send failed", {
      status: response.status,
      body: errorBody,
    });
  }
}

async function downloadMedia(mediaUrl: string, fallbackExtension = "bin"): Promise<DownloadedMedia> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw internalError("Twilio credentials are required to download media");
  }

  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");

  const response = await fetch(mediaUrl, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw unauthorized("Unauthorized to download Twilio media");
  }

  if (!response.ok) {
    const body = await response.text();
    throw internalError("Failed to download Twilio media", {
      status: response.status,
      body,
    });
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "application/octet-stream";
  const disposition = response.headers.get("content-disposition") ?? "";
  const dispositionMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  const fileNameFromHeader = dispositionMatch?.[1] ? decodeURIComponent(dispositionMatch[1]) : "";
  const fileNameFromUrl = mediaUrl.split("/").pop() ?? "";
  const fallbackName = `twilio-media-${Date.now()}.${fallbackExtension}`;
  const fileNameCandidate = fileNameFromHeader || fileNameFromUrl || fallbackName;

  const arrayBuffer = await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
    fileName: sanitizeFileName(fileNameCandidate),
  };
}

export const twilioService = {
  verifySignature,
  sendMessage,
  downloadMedia,
  normalizeWhatsAppAddress,
};
