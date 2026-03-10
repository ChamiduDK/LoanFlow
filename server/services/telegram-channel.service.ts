import { Readable } from "node:stream";
import { env } from "../config/env";
import { internalError } from "../lib/errors";
import { normalizeTelegramChatId } from "../lib/telegram";
import { supabaseAdmin } from "../lib/supabase/client";
import { sendLoanFlowChatMessage } from "./loanflow-chat.service";
import { logAudit } from "./audit.service";
import { transcribeAudioWithGemini, synthesizeSpeechAndStore } from "./speech.service";
import { uploadDocumentForApplication, checkDocumentCompleteness } from "./document.service";
import { scanApplicationDocuments } from "./document-scan.service";
import { aiService } from "./ai.service";
import { knowledgeService } from "./knowledge.service";
import { getTrackerSummary } from "./tracker.service";

export type TelegramMediaEntry = {
  contentType: string;
  fileName: string;
  buffer: Buffer;
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
  const direct = message.match(
    /^(?:app|application)\s*[:#-]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  if (direct?.[1]) return direct[1].toLowerCase();

  const useCmd = message.match(/\b(?:use|set|switch)\s+(?:app|application)(?:\s+id)?\s*[:#-]?\s*([0-9a-f-]{36})\b/i);
  if (useCmd?.[1] && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(useCmd[1])) {
    return useCmd[1].toLowerCase();
  }

  return null;
}

function extractTrackCommand(message: string): { type: "track" | "applications"; applicationId?: string } | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  if (/^\/applications\b/i.test(trimmed) || /^applications\b/i.test(trimmed)) {
    return { type: "applications" };
  }

  const trackMatch = trimmed.match(
    /^\/?track(?:\s+(?:app|application)?\s*[:#-]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?\s*$/i,
  );
  if (trackMatch) {
    return {
      type: "track",
      applicationId: trackMatch[1]?.toLowerCase(),
    };
  }

  return null;
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

async function listUserApplications(userId: string): Promise<Array<{
  id: string;
  status: string;
  requested_amount: number | null;
  created_at: string;
}>> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, status, requested_amount, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw internalError("Failed to load user applications", error);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    status: String(row.status),
    requested_amount: row.requested_amount != null ? Number(row.requested_amount) : null,
    created_at: String(row.created_at),
  }));
}

async function buildApplicationsListReply(userId: string): Promise<string> {
  const applications = await listUserApplications(userId);
  if (applications.length === 0) {
    return "You do not have any loan applications yet. Create an application in LoanFlow first.";
  }

  return [
    "Your recent loan applications:",
    ...applications.map(
      (application, index) =>
        `${index + 1}. ${application.id}\nStatus: ${application.status}\nRequested: ${formatCurrency(application.requested_amount)}\nCreated: ${formatDate(application.created_at)}`,
    ),
    "Use /track <applicationId> to see full tracker status.",
  ].join("\n\n");
}

async function buildTrackerReply(userId: string, session: SessionRow, requestedApplicationId?: string): Promise<string> {
  const applicationId = requestedApplicationId ?? (await resolveApplicationId(userId, session));
  if (!applicationId) {
    return "I could not find an application to track. Use /applications first, then send /track <applicationId>.";
  }

  if (requestedApplicationId) {
    await setSessionApplication(userId, session.id, requestedApplicationId);
  }

  const tracker = await getTrackerSummary(userId, applicationId);
  const recentInstallments = tracker.installmentHistory.slice(0, 3);

  return [
    `Application ${tracker.applicationId}`,
    `Status: ${tracker.status}`,
    `Approved amount: ${formatCurrency(tracker.loanSummary.approvedAmount)}`,
    `Monthly EMI: ${formatCurrency(tracker.loanSummary.emi)}`,
    `Next due date: ${formatDate(tracker.nextDueDate)}`,
    `Progress: ${tracker.progressPercent.toFixed(1)}%`,
    recentInstallments.length > 0
      ? `Recent installments:\n${recentInstallments
          .map(
            (item, index) =>
              `${index + 1}. ${formatDate(item.dueDate)} | ${formatCurrency(item.amount)} | ${item.status}`,
          )
          .join("\n")}`
      : "Recent installments: No installments recorded yet.",
    "Use /applications to list your applications or /track <applicationId> to switch.",
  ].join("\n");
}

async function resolveTelegramLink(chatId: string): Promise<ChannelLinkRow | null> {
  const normalized = normalizeTelegramChatId(chatId);
  const { data, error } = await supabaseAdmin
    .from("user_channel_links")
    .select("id, user_id, is_verified, channel_user_id, metadata")
    .eq("channel_type", "telegram")
    .eq("channel_user_id", normalized)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to resolve Telegram channel link", error);
  }

  return (data as ChannelLinkRow | null) ?? null;
}

async function markLinkVerified(link: ChannelLinkRow, verificationChannel = "telegram_polling"): Promise<void> {
  if (link.is_verified) {
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

async function ensureChannelSession(link: ChannelLinkRow, chatId: string): Promise<SessionRow> {
  const existing = await supabaseAdmin
    .from("chat_sessions")
    .select("id, user_id, application_id, metadata")
    .eq("user_id", link.user_id)
    .eq("channel_link_id", link.id)
    .eq("status", "active")
    .contains("metadata", { channel: "telegram" })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw internalError("Failed to load Telegram session", existing.error);
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
        channel: "telegram",
        chat_id: chatId,
        model: "LoanFlow AI",
      },
    })
    .select("id, user_id, application_id, metadata")
    .single();

  if (insert.error || !insert.data) {
    throw internalError("Failed to create Telegram session", insert.error);
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
        channel: "telegram",
        ...(input.userJson ?? {}),
      },
    },
    {
      session_id: input.sessionId,
      user_id: input.userId,
      role: "assistant",
      message_text: input.assistantText,
      message_json: {
        channel: "telegram",
        ...(input.assistantJson ?? {}),
      },
    },
  ];

  const result = await supabaseAdmin.from("chat_messages").insert(rows);
  if (result.error) {
    throw internalError("Failed to persist Telegram chat messages", result.error);
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
        channel: "telegram",
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
    console.error("Public Telegram reply generation failed", error);
    return "I can help with SME loan guidance. Tell me your business type, requested amount, and preferred repayment period.";
  }
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

async function processTextMessage(input: {
  link: ChannelLinkRow;
  session: SessionRow;
  chatId: string;
  text: string;
}): Promise<{ text: string; mediaUrl?: string }> {
  const trackCommand = extractTrackCommand(input.text);
  if (trackCommand) {
    const reply =
      trackCommand.type === "applications"
        ? await buildApplicationsListReply(input.link.user_id)
        : await buildTrackerReply(input.link.user_id, input.session, trackCommand.applicationId);

    await saveChannelMessages({
      sessionId: input.session.id,
      userId: input.link.user_id,
      userText: input.text,
      assistantText: reply,
      userJson: { channel_message_type: "text", chat_id: input.chatId, handled_command: trackCommand.type },
      assistantJson: { channel_message_type: "text", handled_command: trackCommand.type },
    });

    return { text: reply };
  }

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
      userJson: { channel_message_type: "text", chat_id: input.chatId },
      assistantJson: { channel_message_type: "text", handled_command: "set_application" },
    });

    return { text: ack };
  }

  const ai = await sendLoanFlowChatMessage(input.link.user_id, {
    session_id: input.session.id,
    message: input.text,
    channel: "telegram",
    message_metadata: {
      channel_message_type: "text",
      chat_id: input.chatId,
    },
  });

  return {
    text: ai.assistant_message.message_text ?? "I can help with SME loans. Could you rephrase your question?",
  };
}

async function processVoiceMessage(input: {
  link: ChannelLinkRow;
  session: SessionRow;
  chatId: string;
  caption: string;
  media: TelegramMediaEntry;
}): Promise<{ text: string; mediaUrl?: string }> {
  const transcript = await transcribeAudioWithGemini({
    buffer: input.media.buffer,
    mimeType: input.media.contentType || "audio/ogg",
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
        chat_id: input.chatId,
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
    channel: "telegram",
    message_metadata: {
      channel_message_type: "voice",
      chat_id: input.chatId,
      transcript,
      caption: input.caption,
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
      console.error("Telegram voice reply synthesis failed", error);
    }
  }

  return {
    text: textReply,
    mediaUrl,
  };
}

async function processDocumentMessage(input: {
  link: ChannelLinkRow;
  session: SessionRow;
  chatId: string;
  caption: string;
  media: TelegramMediaEntry;
  ipAddress?: string;
}): Promise<{ text: string; mediaUrl?: string }> {
  const applicationId = await resolveApplicationId(input.link.user_id, input.session);
  if (!applicationId) {
    const msg =
      "I received your document, but I cannot find an application to attach it to. Create an application in LoanFlow, then send `application <ID>` and re-upload.";
    await saveChannelMessages({
      sessionId: input.session.id,
      userId: input.link.user_id,
      userText: input.caption || "[Document upload]",
      assistantText: msg,
      userJson: { channel_message_type: "document", chat_id: input.chatId },
      assistantJson: { channel_message_type: "text", error: "missing_application_context" },
    });
    return { text: msg };
  }

  const normalizedMime = input.media.contentType || "application/octet-stream";
  const fileNameWithExtension = input.media.fileName.includes(".")
    ? input.media.fileName
    : `${input.media.fileName}.${extensionFromMime(normalizedMime)}`;
  const inferredDocType = inferDocumentType(`${input.caption} ${fileNameWithExtension} ${normalizedMime}`);

  const documentRow = await uploadDocumentForApplication({
    userId: input.link.user_id,
    applicationId,
    documentType: inferredDocType,
    file: buildMulterFile({
      fileName: fileNameWithExtension,
      mimeType: normalizedMime,
      buffer: input.media.buffer,
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
    userText: input.caption || "[Document upload]",
    assistantText: reply,
    userJson: {
      channel_message_type: "document",
      inferred_document_type: inferredDocType,
      application_id: applicationId,
      chat_id: input.chatId,
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

export async function processIncomingTelegramMessage(input: {
  chatId: string;
  text: string;
  media?: TelegramMediaEntry;
  ipAddress?: string;
  verificationChannel?: string;
}): Promise<{ replyText: string; replyMediaUrl?: string }> {
  const chatId = normalizeTelegramChatId(input.chatId);
  const text = input.text.trim();
  const link = await resolveTelegramLink(chatId);

  if (!link) {
    const helpText =
      `This Telegram chat is not linked to a LoanFlow account yet.\nChat ID: ${chatId}\nUse the LoanFlow link endpoint or admin helper to attach this chat ID to your user.`;

    if (/^\/start\b/i.test(text) || /^\/link\b/i.test(text) || !text) {
      return { replyText: helpText };
    }

    if (input.media) {
      return { replyText: `${helpText}\nAfter linking, resend the voice note or document.` };
    }

    const publicReply = await generatePublicReply(text);
    return { replyText: `${publicReply}\n\n${helpText}` };
  }

  await markLinkVerified(link, input.verificationChannel ?? "telegram_polling");
  const session = await ensureChannelSession(link, chatId);

  let result: { text: string; mediaUrl?: string };
  if (!input.media) {
    result = await processTextMessage({
      link,
      session,
      chatId,
      text,
    });
  } else if (input.media.contentType.startsWith("audio/")) {
    result = await processVoiceMessage({
      link,
      session,
      chatId,
      caption: text,
      media: input.media,
    });
  } else if (
    input.media.contentType === "application/pdf" ||
    input.media.contentType === "image/jpeg" ||
    input.media.contentType === "image/png"
  ) {
    result = await processDocumentMessage({
      link,
      session,
      chatId,
      caption: text,
      media: input.media,
      ipAddress: input.ipAddress,
    });
  } else {
    result = {
      text: "I received the file, but only PDF/JPG/PNG documents and audio voice notes are supported right now.",
    };
  }

  await logAudit({
    actorUserId: link.user_id,
    action: "telegram.inbound.processed",
    entityType: "chat_sessions",
    entityId: link.id,
    payloadSummary: {
      chat_id: chatId,
      had_media: Boolean(input.media),
      linked_user: true,
    },
    ipAddress: input.ipAddress ?? null,
  });

  return {
    replyText: result.text,
    replyMediaUrl: result.mediaUrl,
  };
}
