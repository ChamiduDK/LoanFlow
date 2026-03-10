import { Router, type Response } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { signInSchema, signUpSchema } from "../schemas/auth";
import { createUserScopedClient, supabaseAdmin } from "../lib/supabase/client";
import { env } from "../config/env";
import { badRequest, internalError, unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rate-limiter";
import { normalizeFeatureAccess } from "../lib/feature-access";

export const authRouter = Router();

function applySessionCookies(res: Response, session: { access_token: string; refresh_token: string }): void {
  const secure = env.NODE_ENV === "production";
  const baseCookieOptions = {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
  } as const;

  res.cookie("sb-access-token", session.access_token, {
    ...baseCookieOptions,
    maxAge: 1000 * 60 * 60,
  });

  res.cookie("sb-refresh-token", session.refresh_token, {
    ...baseCookieOptions,
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
}

authRouter.post(
  "/auth/signup",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(signUpSchema, req.body);

    const { data, error } = await supabaseAdmin.auth.signUp({
      email: payload.email,
      password: payload.password,
    });

    if (error) {
      throw badRequest(error.message, error);
    }

    if (!data.user) {
      throw internalError("Supabase sign up did not return a user");
    }

    if (payload.profile) {
      const { error: profileError } = await supabaseAdmin.from("profiles").update(payload.profile).eq("id", data.user.id);

      if (profileError) {
        throw internalError("User created but failed to update profile", profileError);
      }
    }

    if (data.session?.access_token && data.session?.refresh_token) {
      applySessionCookies(res, {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    sendSuccess(
      res,
      {
        user: data.user,
        session: data.session,
      },
      {
        message: "User account created",
      },
      201,
    );
  }),
);

authRouter.post(
  "/auth/signin",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(signInSchema, req.body);

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });

    if (error || !data.user || !data.session) {
      throw unauthorized("Invalid email or password");
    }

    applySessionCookies(res, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    sendSuccess(res, {
      user: data.user,
      session: data.session,
    });
  }),
);

authRouter.post(
  "/auth/signout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const accessToken = req.auth?.accessToken;

    if (!accessToken) {
      throw unauthorized();
    }

    const scopedClient = createUserScopedClient(accessToken);
    const { error } = await scopedClient.auth.signOut();

    if (error) {
      throw badRequest(error.message, error);
    }

    const secure = env.NODE_ENV === "production";
    const clearOptions = {
      httpOnly: true,
      sameSite: secure ? "none" : "lax",
      secure,
      path: "/",
    } as const;

    res.clearCookie("sb-access-token", clearOptions);
    res.clearCookie("sb-refresh-token", clearOptions);

    sendSuccess(res, { signed_out: true });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const [profileResult, telegramLinkResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabaseAdmin
        .from("user_channel_links")
        .select("id, channel_user_id, is_verified, metadata, updated_at")
        .eq("user_id", userId)
        .eq("channel_type", "telegram")
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      throw internalError("Failed to load profile", profileResult.error);
    }

    if (telegramLinkResult.error) {
      throw internalError("Failed to load Telegram link", telegramLinkResult.error);
    }

    res.setHeader("Cache-Control", "no-store");

    const normalizedProfile = profileResult.data
      ? {
          ...profileResult.data,
          feature_access: normalizeFeatureAccess((profileResult.data as Record<string, unknown>).feature_access),
        }
      : null;

    sendSuccess(res, {
      user: req.auth?.user,
      profile: normalizedProfile,
      telegram_link: telegramLinkResult.data
        ? {
            id: telegramLinkResult.data.id,
            chat_id: telegramLinkResult.data.channel_user_id,
            is_verified: telegramLinkResult.data.is_verified,
            metadata: telegramLinkResult.data.metadata,
            updated_at: telegramLinkResult.data.updated_at,
          }
        : null,
    });
  }),
);
