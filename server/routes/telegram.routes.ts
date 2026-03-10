import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { normalizeTelegramChatId } from "../lib/telegram";
import { asyncHandler } from "../lib/async-handler";
import { badRequest, unauthorized } from "../lib/errors";
import { parseWithSchema } from "../lib/validation";
import { supabaseAdmin } from "../lib/supabase/client";
import { telegramBotService } from "../services/telegram-bot.service";

export const telegramRouter = Router();

const devLinkSchema = z
  .object({
    chat_id: z.string().trim().min(1).max(40),
    user_id: z.string().uuid().optional(),
    email: z.string().email().optional(),
  })
  .refine((value) => Boolean(value.user_id || value.email), {
    message: "Either user_id or email is required",
  });

function assertLocalDevAllowed(): void {
  if (env.NODE_ENV === "production") {
    throw unauthorized("Local Telegram helper endpoints are disabled in production");
  }
}

telegramRouter.get(
  "/telegram/status",
  asyncHandler(async (_req, res) => {
    assertLocalDevAllowed();
    res.status(200).json({
      success: true,
      data: telegramBotService.getStatus(),
    });
  }),
);

telegramRouter.post(
  "/telegram/start",
  asyncHandler(async (_req, res) => {
    assertLocalDevAllowed();
    await telegramBotService.initialize();
    res.status(200).json({
      success: true,
      data: telegramBotService.getStatus(),
    });
  }),
);

telegramRouter.post(
  "/telegram/dev/link",
  asyncHandler(async (req, res) => {
    assertLocalDevAllowed();
    const payload = parseWithSchema(devLinkSchema, req.body ?? {});

    const profileQuery = supabaseAdmin.from("profiles").select("id, email, full_name").limit(1);
    const profileResult = payload.user_id
      ? await profileQuery.eq("id", payload.user_id).maybeSingle()
      : await profileQuery.eq("email", payload.email ?? "").maybeSingle();

    if (profileResult.error) {
      throw badRequest("Failed to load target profile", profileResult.error);
    }

    if (!profileResult.data) {
      throw badRequest("Target profile not found");
    }

    const normalizedChatId = normalizeTelegramChatId(payload.chat_id);
    const upsertResult = await supabaseAdmin
      .from("user_channel_links")
      .upsert(
        {
          user_id: String(profileResult.data.id),
          channel_type: "telegram",
          channel_user_id: normalizedChatId,
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
      throw badRequest("Failed to create localhost Telegram link", upsertResult.error);
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
