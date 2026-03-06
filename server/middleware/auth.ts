import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase/client";
import { forbidden, unauthorized } from "../lib/errors";
import { getFeatureLabel } from "./auth_helpers";
import { normalizeFeatureAccess, type UserFeatureAccess, type UserFeatureKey } from "../lib/feature-access";

type ProfileAccessRow = {
  id: string;
  email: string | null;
  is_admin: boolean;
  is_approved: boolean;
  feature_access: UserFeatureAccess;
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
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const hasApprovalFlag = Object.prototype.hasOwnProperty.call(data, "is_approved");

  return {
    id: String(data.id),
    email: data.email ?? null,
    is_admin: Boolean(data.is_admin),
    is_approved: hasApprovalFlag ? Boolean(data.is_approved) : true,
    feature_access: normalizeFeatureAccess(data.feature_access),
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

export function requireFeatureAccess(featureKey: UserFeatureKey) {
  return async function ensureFeatureAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const auth = req.auth;
    if (!auth?.user?.id) {
      next(unauthorized());
      return;
    }

    const profile = auth.profile ?? await fetchProfileAccess(auth.user.id);
    if (!profile) {
      next(unauthorized("Profile not found for authenticated user"));
      return;
    }

    auth.profile = profile;

    if (profile.is_admin || profile.feature_access[featureKey]) {
      next();
      return;
    }

    next(forbidden(`${getFeatureLabel(featureKey)} access must be enabled by an admin`));
  };
}
