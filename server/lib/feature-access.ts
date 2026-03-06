export type UserFeatureKey =
  | "ai_chat"
  | "new_application"
  | "upload_documents"
  | "track_application"
  | "emi_calculator";

export type UserFeatureAccess = Record<UserFeatureKey, boolean>;

export const DEFAULT_USER_FEATURE_ACCESS: UserFeatureAccess = {
  ai_chat: false,
  new_application: false,
  upload_documents: false,
  track_application: false,
  emi_calculator: false,
};

export const USER_FEATURE_LABELS: Record<UserFeatureKey, string> = {
  ai_chat: "LoanFlow Smart Assistant",
  new_application: "New Loan Application",
  upload_documents: "Upload Documents",
  track_application: "Track Application",
  emi_calculator: "EMI Calculator",
};

export function normalizeFeatureAccess(value: unknown): UserFeatureAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_USER_FEATURE_ACCESS };
  }

  const source = value as Record<string, unknown>;

  return {
    ai_chat: source.ai_chat === true,
    new_application: source.new_application === true,
    upload_documents: source.upload_documents === true,
    track_application: source.track_application === true,
    emi_calculator: source.emi_calculator === true,
  };
}
