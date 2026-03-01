import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase/client";
import { forbidden, unauthorized } from "../lib/errors";

type ProfileAccessRow = {
  id: string;
  email: string | null;
  is_admin: boolean;
  is_approved: boolean;
};

function readAccessToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const tokenFromCookie = req.cookies?.["sb-access-token"];
  if (typeof tokenFromCookie === "string" && tokenFromCookie.length > 0) {
    return tokenFromCookie;
  }

  return null;
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const accessToken = readAccessToken(req);

  if (!accessToken) {
    next();
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (!error && data.user) {
    req.auth = {
      user: data.user,
      accessToken,
    };
  }

  next();
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const accessToken = readAccessToken(req);

  if (!accessToken) {
    next(unauthorized());
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !data.user) {
    next(unauthorized("Invalid or expired access token"));
    return;
  }

  req.auth = {
    user: data.user,
    accessToken,
  };

  next();
}

async function fetchProfileAccess(userId: string): Promise<ProfileAccessRow | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, is_admin, is_approved")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: String(data.id),
    email: data.email ?? null,
    is_admin: Boolean(data.is_admin),
    is_approved: Boolean(data.is_approved),
  };
}

export async function requireApprovedUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = req.auth;
  if (!auth?.user?.id) {
    next(unauthorized());
    return;
  }

  const profile = await fetchProfileAccess(auth.user.id);
  if (!profile) {
    next(unauthorized("Profile not found for authenticated user"));
    return;
  }

  auth.profile = profile;

  if (!profile.is_admin && !profile.is_approved) {
    next(forbidden("Account is pending admin approval"));
    return;
  }

  next();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = req.auth;
  if (!auth?.user?.id) {
    next(unauthorized());
    return;
  }

  const profile = await fetchProfileAccess(auth.user.id);
  if (!profile) {
    next(unauthorized("Profile not found for authenticated user"));
    return;
  }

  auth.profile = profile;

  if (!profile.is_admin) {
    next(forbidden("Admin access required"));
    return;
  }

  next();
}
