import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/useAuthSession";
import { apiFetch } from "@/lib/api/client";
import { supabaseClient } from "@/lib/supabase/client";
import { resolveAccessState, resolvePostAuthPath } from "@/lib/auth";

type MePayload = {
  profile?: {
    is_admin?: boolean;
    is_approved?: boolean;
  } | null;
};

export default function ApprovalPending() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useAuthSession();
  const [signingOut, setSigningOut] = useState(false);
  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => apiFetch<MePayload>("/api/me"),
    enabled: Boolean(sessionQuery.data),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 5_000,
  });

  if (sessionQuery.isLoading || (sessionQuery.data && meQuery.isLoading)) {
    return <div className="p-6 text-sm text-muted-foreground">Checking your account...</div>;
  }

  if (!sessionQuery.data) {
    return <Navigate to="/login" replace />;
  }

  if (meQuery.isError) {
    return <Navigate to="/login" replace />;
  }

  const access = resolveAccessState(meQuery.data?.profile);

  if (access.isAdmin || access.isApproved) {
    return <Navigate to={resolvePostAuthPath(undefined, access)} replace />;
  }

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["me-profile"] });
    await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
  };

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    try {
      await apiFetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
      await supabaseClient.auth.signOut();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Account Approval Pending</CardTitle>
          <CardDescription>
            Your account is waiting for admin approval. You can access the user dashboard once approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => void handleRefresh()}>Refresh Status</Button>
          <Button variant="outline" disabled={signingOut} onClick={() => void handleSignOut()}>
            {signingOut ? "Signing out..." : "Sign Out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
