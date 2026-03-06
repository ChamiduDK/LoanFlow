import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
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

export default function RequireApprovedUser() {
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
    return <RouteFallback message="Checking your access..." />;
  }

  if (!sessionQuery.data) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (meQuery.isError) {
    return <Navigate to="/login" replace />;
  }

  const access = resolveAccessState(meQuery.data?.profile);
  if (!access.isAdmin && !access.isApproved) {
    return <Navigate to={resolvePostAuthPath(undefined, access)} replace />;
  }

  return <Outlet />;
}
