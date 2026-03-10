import { Readable } from "node:stream";
import { env } from "../config/env";
import { internalError } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { sendLoanFlowChatMessage } from "./loanflow-chat.service";
import { logAudit } from "./audit.service";
import { sendWhatsAppMessage } from "./whatsapp-messaging.service";
import { twilioService } from "./twilio.service";
import { transcribeAudioWithGemini, synthesizeSpeechAndStore } from "./speech.service";
import { uploadDocumentForApplication, checkDocumentCompleteness } from "./document.service";
import { scanApplicationDocuments } from "./document-scan.service";
import { aiService } from "./ai.service";
import { knowledgeService } from "./knowledge.service";

type TwilioWebhookPayload = Record<string, unknown>;

export type WhatsAppMediaEntry = {
  mediaUrl: string;
  contentType: string;
  localFile?: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  };
};

type ChannelLinkRow = {
  id: string;
  user_id: string;
  is_verified: boolean;
  channel_user_id: string;
  metadata: Record<string, unknown> | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  application_id: string | null;
  metadata: Record<string, unknown> | null;
};

function normalizePhone(raw: string): string {
  const withoutPrefix = raw.replace(/^whatsapp:/i, "").trim();
  const hasPlus = withoutPrefix.startsWith("+");
  const digits = withoutPrefix.replace(/\D/g, "");
  return `${hasPlus ? "+" : ""}${digits}`;
}

function candidatePhones(raw: string): string[] {
  const normalized = normalizePhone(raw);
  const digitsOnly = normalized.replace(/\D/g, "");
  const withPlus = normalized.startsWith("+") ? normalized : `+${digitsOnly}`;
  const withoutPlus = withPlus.replace(/^\+/, "");
  const localSriLanka =
    withoutPlus.startsWith("94") && withoutPlus.length >= 11 ? `0${withoutPlus.slice(2)}` : null;

  return Array.from(
    new Set(
      [raw.trim(), normalized, withPlus, withoutPlus, localSriLanka]
        .filter((value): value is string => Boolean(value && value.trim().length > 0))
        .map((value) => value.trim()),
    ),
  );
}

function parseMediaEntries(payload: TwilioWebhookPayload): WhatsAppMediaEntry[] {
  const numMediaRaw = Number(payload.NumMedia ?? 0);
  const numMedia = Number.isFinite(numMediaRaw) ? Math.max(0, Math.min(10, Math.trunc(numMediaRaw))) : 0;
  const entries: WhatsAppMediaEntry[] = [];

  for (let index = 0; index < numMedia; index += 1) {
    const mediaUrl = String(payload[`MediaUrl${index}`] ?? "").trim();
    const contentType = String(payload[`MediaContentType${index}`] ?? "").trim().toLowerCase();
    if (!mediaUrl) continue;
    entries.push({ mediaUrl, contentType });
  }

  return entries;
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/mp4" || mimeType === "audio/aac") return "m4a";
  return "bin";
}

function inferDocumentType(label: string): string {
  const lower = label.toLowerCase();
  if (/(^|\s)(nic|national identity|id card)($|\s)/i.test(lower)) return "nic";
  if (/bank statement|statement/.test(lower)) return "bank_statement";
  if (/business registration|br certificate|certificate of registration/.test(lower)) return "business_registration";
  if (/financial statement|balance sheet|income statement|p\/l|profit/.test(lower)) return "financial_statements";
  if (/passport/.test(lower)) return "passport";
  if (/utility/.test(lower)) return "utility_bill";
  return "supporting_document";
}

function extractApplicationCommand(message: string): string | null {
  const direct = message.match(/^(?:app|application)\s*[:#-]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (direct?.[1]) return direct[1].toLowerCase();

  const useCmd = message.match(/\b(?:use|set|switch)\s+(?:app|application)(?:\s+id)?\s*[:#-]?\s*([0-9a-f-]{36})\b/i);
  if (useCmd?.[1] && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(useCmd[1])) {
    return useCmd[1].toLowerCase();
  }

  return null;
}

function toSpeakableText(input: string): string {
  const plain = input
    .replace(/[*_`#>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 650) return plain;
  return `${plain.slice(0, 647).trimEnd()}...`;
}

async function resolveWhatsappLink(from: string): Promise<ChannelLinkRow | null> {
  const candidates = candidatePhones(from);
  if (candidates.length === 0) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("user_channel_links")
    .select("id, user_id, is_verified, channel_user_id, metadata")
    .eq("channel_type", "whatsapp")
    .in("channel_user_id", candidates)
    .limit(10);

  if (error) {
    throw internalError("Failed to resolve WhatsApp channel link", error);
  }

  const rows = (data ?? []) as ChannelLinkRow[];
  if (rows.length === 0) {
    return null;
  }

  const fromNormalized = normalizePhone(from);
  const exact = rows.find((row) => normalizePhone(row.channel_user_id) === fromNormalized);
  return exact ?? rows[0];
}

async function markLinkVerified(link: ChannelLinkRow, verificationChannel = "twilio_whatsapp_webhook"): Promise<void> {
  if (link.is_verified || !env.WHATSAPP_AUTO_VERIFY_LINK) {
    return;
  }

  await supabaseAdmin
    .from("user_channel_links")
    .update({
      is_verified: true,
      metadata: {
        ...(link.metadata ?? {}),
        verified_at: new Date().toISOString(),
        verification_channel: verificationChannel,
      },
    })
    .eq("id", link.id);
}

async function ensureChannelSession(
  link: ChannelLinkRow,
  phone: string,
  channel: "whatsapp" | "voice_call",
): Promise<SessionRow> {
  const existing = await supabaseAdmin
    .from("chat_sessions")
    .select("id, user_id, application_id, metadata")
    .eq("user_id", link.user_id)
    .eq("channel_link_id", link.id)
    .eq("status", "active")
    .contains("metadata", { channel })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw internalError("Failed to load WhatsApp session", existing.error);
  }

  if (existing.data) {
    return existing.data as SessionRow;
  }

  const insert = await supabaseAdmin
    .from("chat_sessions")
    .insert({
      user_id: link.user_id,
      channel_link_id: link.id,
      status: "active",
      metadata: {
        channel,
        phone,
        model: "LoanFlow AI",
      },
    })
    .select("id, user_id, application_id, metadata")
    .single();

  if (insert.error || !insert.data) {
    throw internalError("Failed to create WhatsApp session", insert.error);
  }

  return insert.data as SessionRow;
}

async function saveChannelMessages(input: {
  sessionId: string;
  userId: string;
  userText: string;
  assistantText: string;
  userJson?: Record<string, unknown>;
  assistantJson?: Record<string, unknown>;
}): Promise<void> {
  const rows = [
    {
      session_id: input.sessionId,
      user_id: input.userId,
      role: "user",
      message_text: input.userText,
      message_json: {
        channel: "whatsapp",
        ...(input.userJson ?? {}),
      },
    },
    {
      session_id: input.sessionId,
      user_id: input.userId,
      role: "assistant",
      message_text: input.assistantText,
      message_json: {
        channel: "whatsapp",
        ...(input.assistantJson ?? {}),
      },
    },
  ];

  const result = await supabaseAdmin.from("chat_messages").insert(rows);
  if (result.error) {
    throw internalError("Failed to persist WhatsApp chat messages", result.error);
  }
}

async function setSessionApplication(userId: string, sessionId: string, applicationId: string): Promise<boolean> {
  const app = await supabaseAdmin
    .from("loan_applications")
    .select("id")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (app.error) {
    throw internalError("Failed to validate application ownership", app.error);
  }
  if (!app.data) return false;

  const session = await supabaseAdmin
    .from("chat_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (session.error) {
    throw internalError("Failed to load session metadata", session.error);
  }

  const existingMetadata =
    session.data?.metadata && typeof session.data.metadata === "object" && !Array.isArray(session.data.metadata)
      ? (session.data.metadata as Record<string, unknown>)
      : {};

  const update = await supabaseAdmin
    .from("chat_sessions")
    .update({
      application_id: applicationId,
      metadata: {
        ...existingMetadata,
        channel: String(existingMetadata.channel ?? "whatsapp"),
        selected_application_id: applicationId,
        application_set_at: new Date().toISOString(),
      },
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (update.error) {
    throw internalError("Failed to update session application context", update.error);
  }

  return true;
}

async function resolveApplicationId(userId: string, session: SessionRow): Promise<string | null> {
  if (session.application_id) return session.application_id;

  const latest = await supabaseAdmin
    .from("loan_applications")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) {
    throw internalError("Failed to resolve latest application", latest.error);
  }

  if (!latest.data?.id) {
    return null;
  }

  await setSessionApplication(userId, session.id, String(latest.data.id));
  return String(latest.data.id);
}

async function generatePublicReply(message: string): Promise<string> {
  try {
    const [chunks, banksResult] = await Promise.all([
      knowledgeService.retrieveRelevant(message, 2).catch(() => []),
      supabaseAdmin.from("banks").select("name").eq("is_active", true).order("name", { ascending: true }).limit(12),
    ]);

    const bankNames = (banksResult.data ?? []).map((row) => String((row as { name?: string }).name ?? "")).filter(Boolean);
    const context = chunks.map((chunk) => `Source: ${chunk.filename}\n${chunk.content}`).join("\n\n");

    const prompt = [
      "You are LoanFlow AI for Sri Lankan SME loans.",
      "Reply in a concise conversational way.",
      "If information is missing, ask a follow-up question.",
      `Reference banks: ${bankNames.join(", ")}`,
      context ? `Knowledge context:\n${context}` : "",
      `User message: ${message}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const answer = await aiService.generateChatResponse(
      "You help Sri Lankan SME owners understand loan eligibility, rates, and required documents.",
      [],
      prompt,
    );

    return answer.trim() || "I can help with SME loan guidance. What loan amount and business type are you considering?";
  } catch (error) {
    console.error("Public WhatsApp reply generation failed", error);
    return "I can help with SME loan guidance. Tell me your business type, requested amount, and preferred repayment period.";
  }
}

async function processTextMessage(input: {
  link: ChannelLinkRow;
  session: SessionRow;
  from: string;
  text: string;
}): Promise<{ text: string; mediaUrl?: string }> {
  const applicationIdCommand = extractApplicationCommand(input.text.trim());
  if (applicationIdCommand) {
    const applied = await setSessionApplication(input.link.user_id, input.session.id, applicationIdCommand);
    const ack = applied
      ? `Application context set to ${applicationIdCommand}. You can now send documents or ask loan questions.`
      : "I could not find that application under your account. Please check the application ID and try again.";

    await saveChannelMessages({
      sessionId: input.session.id,
      userId: input.link.user_id,
      userText: input.text,
      assistantText: ack,
      userJson: { channel_message_type: "text", from: input.from },
      assistantJson: { channel_message_type: "text", handled_command: "set_application" },
    });

    return { text: ack };
  }

  const ai = await sendLoanFlowChatMessage(input.link.user_id, {
    session_id: input.session.id,
    message: input.text,
    channel: "whatsapp",
    message_metadata: {
      channel_message_type: "text",
      from: input.from,
    },
  });

  return {
    text: ai.assistant_message.message_text ?? "I can help with SME loans. Could you rephrase your question?",
  };
}

async function processVoiceMessage(input: {
  link: ChannelLinkRow;
  session: SessionRow;
  from: string;
  body: string;
  media: WhatsAppMediaEntry;
}): Promise<{ text: string; mediaUrl?: string }> {
  const downloaded = input.media.localFile
    ? {
      buffer: input.media.localFile.buffer,
      mimeType: input.media.localFile.mimeType,
      fileName: input.media.localFile.fileName,
    }
    : await twilioService.downloadMedia(input.media.mediaUrl, extensionFromMime(input.media.contentType));
  const transcript = await transcribeAudioWithGemini({
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType || input.media.contentType || "audio/ogg",
  });

  if (!transcript) {
    const failed = "I could not clearly transcribe that voice note. Please try again or send your question as text.";
    await saveChannelMessages({
      sessionId: input.session.id,
      userId: input.link.user_id,
      userText: "[Voice note]",
      assistantText: failed,
      userJson: {
        channel_message_type: "voice",
        media_url: input.media.mediaUrl,
      },
      assistantJson: {
        channel_message_type: "text",
        voice_transcription: "failed",
      },
    });
    return { text: failed };
  }

  const ai = await sendLoanFlowChatMessage(input.link.user_id, {
    session_id: input.session.id,
    message: transcript,
    channel: "whatsapp",
    message_metadata: {
      channel_message_type: "voice",
      media_url: input.media.mediaUrl,
      transcript,
    },
  });

  const textReply = ai.assistant_message.message_text ?? "I processed your voice note. Please send more details if needed.";
  let mediaUrl: string | undefined;

  if (env.WHATSAPP_SEND_VOICE_REPLY) {
    try {
      const ttsUrl = await synthesizeSpeechAndStore(textReply);
      if (ttsUrl) {
        mediaUrl = ttsUrl;
      }
    } catch (error) {
      console.error("Voice reply synthesis failed", error);
    }
  }

  return {
    text: textReply,
    mediaUrl,
  };
}

function buildMulterFile(input: { fileName: string; mimeType: string; buffer: Buffer }): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: input.fileName,
    encoding: "7bit",
    mimetype: input.mimeType,
    size: input.buffer.byteLength,
    buffer: input.buffer,
    destination: "",
    filename: input.fileName,
    path: "",
    stream: Readable.from(input.buffer),
  };
}

async function processDocumentMessage(input: {
  link: ChannelLinkRow;
  session: SessionRow;
  from: string;
  body: string;
  media: WhatsAppMediaEntry;
  ipAddress?: string;
}): Promise<{ text: string; mediaUrl?: string }> {
  const applicationId = await resolveApplicationId(input.link.user_id, input.session);
  if (!applicationId) {
    const msg =
      "I received your document, but I cannot find an application to attach it to. Create an application in LoanFlow, then send `application <ID>` and re-upload.";
    await saveChannelMessages({
      sessionId: input.session.id,
      userId: input.link.user_id,
      userText: input.body || "[Document upload]",
      assistantText: msg,
      userJson: { channel_message_type: "document", media_url: input.media.mediaUrl },
      assistantJson: { channel_message_type: "text", error: "missing_application_context" },
    });
    return { text: msg };
  }

  const download = input.media.localFile
    ? {
      buffer: input.media.localFile.buffer,
      mimeType: input.media.localFile.mimeType,
      fileName: input.media.localFile.fileName,
    }
    : await twilioService.downloadMedia(input.media.mediaUrl, extensionFromMime(input.media.contentType));
  const normalizedMime = download.mimeType || input.media.contentType || "application/octet-stream";
  const fileNameWithExtension = download.fileName.includes(".")
    ? download.fileName
    : `${download.fileName}.${extensionFromMime(normalizedMime)}`;
  const inferredDocType = inferDocumentType(`${input.body} ${fileNameWithExtension} ${normalizedMime}`);

  const documentRow = await uploadDocumentForApplication({
    userId: input.link.user_id,
    applicationId,
    documentType: inferredDocType,
    file: buildMulterFile({
      fileName: fileNameWithExtension,
      mimeType: normalizedMime,
      buffer: download.buffer,
    }),
    ipAddress: input.ipAddress,
  });

  const scanResult = await scanApplicationDocuments(input.link.user_id, applicationId, {
    ipAddress: input.ipAddress,
  });
  const checklist = await checkDocumentCompleteness(input.link.user_id, applicationId);

  const uploadedDocumentId = String((documentRow as { id?: string }).id ?? "");
  const matchedDoc = Array.isArray((scanResult as { documents?: unknown[] }).documents)
    ? ((scanResult as { documents?: Array<Record<string, unknown>> }).documents ?? []).find(
      (row) => String(row.document_id ?? "") === uploadedDocumentId,
    )
    : null;

  const summary = (scanResult as { summary?: Record<string, unknown> }).summary ?? {};
  const missingRequiredCount = Number((checklist.summary as Record<string, unknown>)?.total_missing ?? 0);
  const validationStatus = String(matchedDoc?.validation_status ?? "unclear");
  const detectedType = String(matchedDoc?.detected_doc_type ?? "unknown");
  const guidanceStatus =
    validationStatus === "valid"
      ? "clear match"
      : validationStatus === "invalid"
        ? "needs attention"
        : "pending analysis";
  const reply = [
    `Document received and attached to application ${applicationId}.`,
    `Detected type: ${detectedType}. AI guidance status: ${guidanceStatus}.`,
    `Current guidance summary: ${Number(summary.valid_count ?? 0)} clear match(es), ${Number(summary.invalid_count ?? 0)} needing attention, ${Number(summary.unclear_count ?? 0)} pending analysis.`,
    `Missing required documents: ${missingRequiredCount}.`,
  ].join(" ");

  await saveChannelMessages({
    sessionId: input.session.id,
    userId: input.link.user_id,
    userText: input.body || "[Document upload]",
    assistantText: reply,
    userJson: {
      channel_message_type: "document",
      media_url: input.media.mediaUrl,
      inferred_document_type: inferredDocType,
      application_id: applicationId,
    },
    assistantJson: {
      channel_message_type: "document_result",
      uploaded_document_id: uploadedDocumentId,
      validation_status: validationStatus,
      guidance_status: guidanceStatus,
    },
  });

  return { text: reply };
}

async function processLinkedInbound(payload: {
  link: ChannelLinkRow;
  from: string;
  body: string;
  mediaEntries: WhatsAppMediaEntry[];
  ipAddress?: string;
  verificationChannel?: string;
}): Promise<{ text: string; mediaUrl?: string }> {
  await markLinkVerified(payload.link, payload.verificationChannel);
  const session = await ensureChannelSession(payload.link, payload.from, "whatsapp");

  if (payload.mediaEntries.length === 0) {
    if (!payload.body.trim()) {
      return { text: "Please send a message, voice note, or a document to continue." };
    }

    return processTextMessage({
      link: payload.link,
      session,
      from: payload.from,
      text: payload.body,
    });
  }

  const primary = payload.mediaEntries[0];
  if (primary.contentType.startsWith("audio/")) {
    return processVoiceMessage({
      link: payload.link,
      session,
      from: payload.from,
      body: payload.body,
      media: primary,
    });
  }

  if (
    primary.contentType === "application/pdf" ||
    primary.contentType === "image/jpeg" ||
    primary.contentType === "image/png"
  ) {
    return processDocumentMessage({
      link: payload.link,
      session,
      from: payload.from,
      body: payload.body,
      media: primary,
      ipAddress: payload.ipAddress,
    });
  }

  return {
    text: "I received the media file, but only PDF/JPG/PNG documents and audio voice notes are supported right now.",
  };
}

export async function handleIncomingWhatsAppWebhook(payload: TwilioWebhookPayload, ipAddress?: string): Promise<void> {
  const result = await processIncomingWhatsAppMessage(payload, ipAddress);

  await sendWhatsAppMessage({
    to: result.from,
    body: result.replyText,
    mediaUrl: result.replyMediaUrl,
  });
}

export async function processDirectWhatsAppMessage(input: {
  from: string;
  body: string;
  mediaEntries: WhatsAppMediaEntry[];
  ipAddress?: string;
  verificationChannel?: string;
}): Promise<{ from: string; replyText: string; replyMediaUrl?: string }> {
  const from = input.from.trim();
  if (!from) {
    throw internalError("Missing From in WhatsApp message payload");
  }

  const body = input.body.trim();
  const mediaEntries = input.mediaEntries;
  const link = await resolveWhatsappLink(from);
  let responseText = "";
  let responseMediaUrl: string | undefined;

  if (!link) {
    if (mediaEntries.length > 0 && !body) {
      responseText =
        "Your number is not linked to a LoanFlow account yet. Sign in to LoanFlow and use Link WhatsApp first, then resend your message.";
    } else {
      responseText = await generatePublicReply(body || "SME loan guidance");
    }
  } else {
    const processed = await processLinkedInbound({
      link,
      from,
      body,
      mediaEntries,
      ipAddress: input.ipAddress,
      verificationChannel: input.verificationChannel,
    });
    responseText = processed.text;
    responseMediaUrl = processed.mediaUrl;
  }

  await logAudit({
    actorUserId: link?.user_id ?? null,
    action: "whatsapp.inbound.processed",
    entityType: "chat_sessions",
    entityId: link?.id ?? null,
    payloadSummary: {
      from: normalizePhone(from),
      had_media: mediaEntries.length > 0,
      media_count: mediaEntries.length,
      linked_user: Boolean(link?.user_id),
    },
    ipAddress: input.ipAddress ?? null,
  });

  return {
    from,
    replyText: responseText,
    replyMediaUrl: responseMediaUrl,
  };
}

export async function processIncomingWhatsAppMessage(
  payload: TwilioWebhookPayload,
  ipAddress?: string,
): Promise<{ from: string; replyText: string; replyMediaUrl?: string }> {
  return processDirectWhatsAppMessage({
    from: String(payload.From ?? "").trim(),
    body: String(payload.Body ?? "").trim(),
    mediaEntries: parseMediaEntries(payload),
    ipAddress,
    verificationChannel: "twilio_whatsapp_webhook",
  });
}

export async function handleVoiceCallTurn(input: {
  from: string;
  speechResult: string;
  ipAddress?: string;
}): Promise<string> {
  const speech = input.speechResult.trim();
  if (!speech) {
    return "I could not hear your request clearly. Please say your loan question again.";
  }

  const link = await resolveWhatsappLink(input.from);
  if (!link) {
    const publicAnswer = await generatePublicReply(speech);
    return toSpeakableText(publicAnswer);
  }

  const session = await ensureChannelSession(link, input.from, "voice_call");
  const ai = await sendLoanFlowChatMessage(link.user_id, {
    session_id: session.id,
    message: speech,
    channel: "voice_call",
    message_metadata: {
      channel_message_type: "voice_call",
      caller: input.from,
    },
  });

  return toSpeakableText(ai.assistant_message.message_text ?? "Please share your question again.");
}

export async function simulateIncomingWhatsAppText(input: {
  from: string;
  body: string;
  ipAddress?: string;
}): Promise<{ replyText: string; replyMediaUrl?: string }> {
  const result = await processIncomingWhatsAppMessage(
    {
      From: input.from,
      Body: input.body,
      NumMedia: 0,
    },
    input.ipAddress,
  );

  return {
    replyText: result.replyText,
    replyMediaUrl: result.replyMediaUrl,
  };
}

export async function simulateIncomingWhatsAppAudio(input: {
  from: string;
  body?: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  ipAddress?: string;
}): Promise<{ replyText: string; replyMediaUrl?: string }> {
  const link = await resolveWhatsappLink(input.from);
  if (!link) {
    return {
      replyText: "Your number is not linked to a LoanFlow account yet. Link WhatsApp first, then retry the voice note.",
    };
  }

  await markLinkVerified(link, "localhost_simulated_whatsapp");
  const session = await ensureChannelSession(link, input.from, "whatsapp");
  const result = await processVoiceMessage({
    link,
    session,
    from: input.from,
    body: input.body ?? "",
    media: {
      mediaUrl: "",
      contentType: input.mimeType,
      localFile: {
        buffer: input.buffer,
        fileName: input.fileName,
        mimeType: input.mimeType,
      },
    },
  });

  return {
    replyText: result.text,
    replyMediaUrl: result.mediaUrl,
  };
}

export async function simulateIncomingWhatsAppDocument(input: {
  from: string;
  body?: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  ipAddress?: string;
}): Promise<{ replyText: string; replyMediaUrl?: string }> {
  const link = await resolveWhatsappLink(input.from);
  if (!link) {
    return {
      replyText: "Your number is not linked to a LoanFlow account yet. Link WhatsApp first, then retry the document upload.",
    };
  }

  await markLinkVerified(link, "localhost_simulated_whatsapp");
  const session = await ensureChannelSession(link, input.from, "whatsapp");
  const result = await processDocumentMessage({
    link,
    session,
    from: input.from,
    body: input.body ?? "",
    media: {
      mediaUrl: "",
      contentType: input.mimeType,
      localFile: {
        buffer: input.buffer,
        fileName: input.fileName,
        mimeType: input.mimeType,
      },
    },
    ipAddress: input.ipAddress,
  });

  return {
    replyText: result.text,
    replyMediaUrl: result.mediaUrl,
  };
}
