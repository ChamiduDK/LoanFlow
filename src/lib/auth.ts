export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AccessState = {
  isAdmin: boolean;
  isApproved: boolean;
};

export type MeProfileAccess = {
  is_admin?: boolean;
  is_approved?: boolean;
} | null | undefined;

const userAppRoutePrefixes = [
  "/dashboard",
  "/apply",
  "/results",
  "/calculator",
  "/documents",
  "/tracker",
  "/management",
];

function defaultPostAuthPath(access: AccessState): string {
  if (access.isAdmin) {
    return "/admin";
  }

  return access.isApproved ? "/dashboard" : "/approval-pending";
}

function isUserAppPath(path: string): boolean {
  return userAppRoutePrefixes.some((prefix) => path.startsWith(prefix));
}

export function resolveAccessState(profile: MeProfileAccess): AccessState {
  const isAdmin = Boolean(profile?.is_admin);

  // Backward compatibility: older DBs may not have is_approved yet.
  const hasApprovalFlag =
    profile !== null &&
    profile !== undefined &&
    Object.prototype.hasOwnProperty.call(profile, "is_approved");
  const isApproved = isAdmin || !hasApprovalFlag ? true : Boolean(profile?.is_approved);

  return { isAdmin, isApproved };
}

export function resolvePostAuthPath(fromPath: string | undefined, access: AccessState): string {
  const from = fromPath?.trim();

  if (!from || !from.startsWith("/")) {
    return defaultPostAuthPath(access);
  }

  if (from.startsWith("/admin")) {
    return access.isAdmin ? from : defaultPostAuthPath(access);
  }

  if (isUserAppPath(from)) {
    return access.isAdmin || access.isApproved ? from : "/approval-pending";
  }

  if (from === "/approval-pending" && (access.isAdmin || access.isApproved)) {
    return defaultPostAuthPath(access);
  }

  if (from) {
    return from;
  }

  return defaultPostAuthPath(access);
}
