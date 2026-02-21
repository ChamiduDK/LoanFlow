import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase/client";
import { forbidden, unauthorized } from "../lib/errors";

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

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.auth?.user?.id) {
    next(unauthorized());
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, is_admin")
    .eq("id", req.auth.user.id)
    .maybeSingle();

  if (error || !data) {
    next(unauthorized("Profile not found for authenticated user"));
    return;
  }

  req.auth.profile = data;

  if (!data.is_admin) {
    next(forbidden("Admin access required"));
    return;
  }

  next();
}
