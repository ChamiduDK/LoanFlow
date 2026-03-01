export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AccessState = {
  isAdmin: boolean;
  isApproved: boolean;
};

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
