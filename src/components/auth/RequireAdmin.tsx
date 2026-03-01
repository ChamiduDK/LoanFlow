import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import { apiFetch } from "@/lib/api/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import RouteFallback from "./RouteFallback";
import { resolveAccessState, resolvePostAuthPath } from "@/lib/auth";

type MePayload = {
  profile?: {
    is_admin?: boolean;
    is_approved?: boolean;
  } | null;
};

export default function RequireAdmin() {
  const sessionQuery = useAuthSession();

  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => apiFetch<MePayload>("/api/me"),
    enabled: Boolean(sessionQuery.data),
    retry: false,
    staleTime: 30_000,
  });

  if (sessionQuery.isLoading || (sessionQuery.data && meQuery.isLoading)) {
    return <RouteFallback message="Checking your access..." />;
  }

  if (!sessionQuery.data) {
    return <Navigate to="/login" replace />;
  }

  if (meQuery.isError) {
    return <Navigate to="/dashboard" replace />;
  }

  const access = resolveAccessState(meQuery.data?.profile);
  if (!access.isAdmin) {
    return <Navigate to={resolvePostAuthPath(undefined, access)} replace />;
  }

  return <Outlet />;
}
