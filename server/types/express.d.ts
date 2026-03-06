import type { User } from "@supabase/supabase-js";
import type { UserFeatureAccess } from "../lib/feature-access";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      auth?: {
        user: User;
        accessToken: string;
        profile?: {
          id: string;
          is_admin: boolean;
          is_approved: boolean;
          email: string | null;
          feature_access: UserFeatureAccess;
        };
      };
    }
  }
}

export {};
