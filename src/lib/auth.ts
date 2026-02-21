export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function resolvePostAuthPath(fromPath: string | undefined, isAdmin: boolean): string {
  const from = fromPath?.trim();
  if (from) {
    return from;
  }

  return isAdmin ? "/admin" : "/dashboard";
}
