import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { Lock, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import RouteFallback from "./RouteFallback";
import { resolveAccessState, resolvePostAuthPath } from "@/lib/auth";
import { hasFeatureAccess, USER_FEATURE_META, type UserFeatureKey } from "@/lib/feature-access";

type MePayload = {
  profile?: {
    is_admin?: boolean;
    is_approved?: boolean;
    feature_access?: Record<string, boolean> | null;
  } | null;
};

interface RequireFeatureAccessProps {
  featureKey: UserFeatureKey;
}

export default function RequireFeatureAccess({ featureKey }: RequireFeatureAccessProps) {
  const location = useLocation();
  const sessionQuery = useAuthSession();
  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => apiFetch<MePayload>("/api/me"),
    enabled: Boolean(sessionQuery.data),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (sessionQuery.isLoading || (sessionQuery.data && meQuery.isLoading && !meQuery.data && !meQuery.isError)) {
    return <RouteFallback message="Checking feature access..." />;
  }

  if (!sessionQuery.data) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  if (meQuery.isError) {
    return <Navigate to="/login" replace />;
  }

  const access = resolveAccessState(meQuery.data?.profile);
  if (!access.isAdmin && !access.isApproved) {
    return <Navigate to={resolvePostAuthPath(undefined, access)} replace />;
  }

  if (hasFeatureAccess(meQuery.data?.profile, featureKey)) {
    return <Outlet />;
  }

  const feature = USER_FEATURE_META[featureKey];

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-xl border-border/70 bg-card shadow-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <Lock className="h-5 w-5" />
          </div>
          <CardTitle>{feature.title} access required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            This feature is locked for your account. An admin must enable access before you can use it.
          </p>
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2 font-medium text-foreground">
              <ShieldAlert className="h-4 w-4" />
              {feature.adminMessage}
            </div>
          </div>
          <div className="flex justify-center">
            <Button asChild>
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
