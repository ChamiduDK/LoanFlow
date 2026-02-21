import type { User } from "@supabase/supabase-js";

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
          email: string | null;
        };
      };
    }
  }
}

export {};
