import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import RouteFallback from "./RouteFallback";
import { apiFetch } from "@/lib/api/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { resolveAccessState, resolvePostAuthPath } from "@/lib/auth";

type MePayload = {
  profile?: {
    is_admin?: boolean;
    is_approved?: boolean;
  } | null;
};

export default function RequireGuest() {
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
    return <RouteFallback message="Checking your session..." />;
  }

  if (sessionQuery.data) {
    const access = resolveAccessState(meQuery.data?.profile);
    return <Navigate to={resolvePostAuthPath(undefined, access)} replace />;
  }

  return <Outlet />;
}
