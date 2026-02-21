import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";

export function useAuthSession() {
  return useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) {
        throw error;
      }

      return data.session;
    },
    staleTime: 30_000,
  });
}
