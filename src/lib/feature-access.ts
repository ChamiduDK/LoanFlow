export type UserFeatureKey =
  | "ai_chat"
  | "new_application"
  | "upload_documents"
  | "track_application"
  | "emi_calculator";

export type UserFeatureAccess = Record<UserFeatureKey, boolean>;

export type FeatureAwareProfile =
  | {
      is_admin?: boolean;
      feature_access?: Partial<UserFeatureAccess> | null;
    }
  | null
  | undefined;

export const DEFAULT_USER_FEATURE_ACCESS: UserFeatureAccess = {
  ai_chat: false,
  new_application: false,
  upload_documents: false,
  track_application: false,
  emi_calculator: false,
};

export const USER_FEATURE_ORDER: UserFeatureKey[] = [
  "ai_chat",
  "new_application",
  "upload_documents",
  "track_application",
  "emi_calculator",
];

export const USER_FEATURE_META: Record<
  UserFeatureKey,
  {
    title: string;
    shortTitle: string;
    path: string;
    adminMessage: string;
  }
> = {
  ai_chat: {
    title: "LoanFlow Smart Assistant",
    shortTitle: "AI Chat",
    path: "/chat",
    adminMessage: "Admin must enable AI Chat access for this user.",
  },
  new_application: {
    title: "New Loan Application",
    shortTitle: "New Application",
    path: "/apply",
    adminMessage: "Admin must enable new application access for this user.",
  },
  upload_documents: {
    title: "Documents & Guidance",
    shortTitle: "Documents",
    path: "/documents",
    adminMessage: "Admin must enable document guidance access for this user.",
  },
  track_application: {
    title: "Track Application",
    shortTitle: "Track Application",
    path: "/tracker",
    adminMessage: "Admin must enable application tracking access for this user.",
  },
  emi_calculator: {
    title: "EMI Calculator",
    shortTitle: "EMI Calculator",
    path: "/calculator",
    adminMessage: "Admin must enable EMI calculator access for this user.",
  },
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

export function hasFeatureAccess(profile: FeatureAwareProfile, featureKey: UserFeatureKey): boolean {
  if (profile?.is_admin) {
    return true;
  }

  return normalizeFeatureAccess(profile?.feature_access)[featureKey];
}
