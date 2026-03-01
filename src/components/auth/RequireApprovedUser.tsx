import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { apiFetch } from "@/lib/api/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import RouteFallback from "./RouteFallback";
import { resolvePostAuthPath } from "@/lib/auth";

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
    staleTime: 30_000,
  });

  if (sessionQuery.isLoading || (sessionQuery.data && meQuery.isLoading)) {
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

  const isAdmin = Boolean(meQuery.data?.profile?.is_admin);
  const isApproved = Boolean(meQuery.data?.profile?.is_approved);
  if (!isAdmin && !isApproved) {
    return <Navigate to={resolvePostAuthPath(undefined, { isAdmin, isApproved })} replace />;
  }

  return <Outlet />;
}
