import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { internalError } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { aiService } from "./ai.service";

function normalizeTranscript(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  return cleaned.replace(/^["'`]|["'`]$/g, "").trim();
}

function clampVoiceText(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length <= 700) return trimmed;
  return `${trimmed.slice(0, 697).trimEnd()}...`;
}

export async function transcribeAudioWithGemini(input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<string | null> {
  if (env.WHATSAPP_STT_PROVIDER === "disabled") {
    return null;
  }

  if (input.buffer.byteLength === 0) {
    return null;
  }

  const prompt = [
    "You are a speech-to-text engine.",
    "Transcribe the given audio exactly into plain text.",
    "Return only the transcript text without labels, JSON, or markdown.",
    "If unintelligible, return exactly: UNINTELLIGIBLE",
  ].join("\n");

  const transcript = await aiService.generateTextFromParts(
    prompt,
    [
      { inlineData: { mimeType: input.mimeType, data: input.buffer.toString("base64") } },
      { text: "Provide transcript now." },
    ],
    { temperature: 0 },
  );

  const normalized = normalizeTranscript(transcript);
  if (!normalized || normalized.toUpperCase() === "UNINTELLIGIBLE") {
    return null;
  }

  return normalized;
}

export async function synthesizeSpeechAndStore(text: string): Promise<string | null> {
  if (env.WHATSAPP_TTS_PROVIDER !== "google") {
    return null;
  }
  if (!env.GOOGLE_TTS_API_KEY) {
    return null;
  }

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text: clampVoiceText(text) },
        voice: {
          languageCode: env.GOOGLE_TTS_LANGUAGE_CODE,
          ...(env.GOOGLE_TTS_VOICE_NAME ? { name: env.GOOGLE_TTS_VOICE_NAME } : {}),
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw internalError("Google TTS request failed", {
      status: response.status,
      body,
    });
  }

  const payload = (await response.json()) as { audioContent?: string };
  if (!payload.audioContent) {
    return null;
  }

  const audioBuffer = Buffer.from(payload.audioContent, "base64");
  const path = `voice-replies/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.mp3`;

  const upload = await supabaseAdmin.storage.from(env.SUPABASE_DOCS_BUCKET).upload(path, audioBuffer, {
    contentType: "audio/mpeg",
    upsert: false,
  });

  if (upload.error) {
    throw internalError("Failed to upload synthesized speech", upload.error);
  }

  const signed = await supabaseAdmin.storage.from(env.SUPABASE_DOCS_BUCKET).createSignedUrl(path, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    throw internalError("Failed to create signed URL for synthesized speech", signed.error);
  }

  return signed.data.signedUrl;
}
