import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import RouteFallback from "./RouteFallback";
import { apiFetch } from "@/lib/api/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { resolvePostAuthPath } from "@/lib/auth";

type MePayload = {
  profile?: {
    is_admin?: boolean;
  } | null;
};

export default function RequireGuest() {
  const sessionQuery = useAuthSession();
  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => apiFetch<MePayload>("/api/me"),
    enabled: Boolean(sessionQuery.data),
    retry: false,
    staleTime: 30_000,
  });

  if (sessionQuery.isLoading || (sessionQuery.data && meQuery.isLoading)) {
    return <RouteFallback message="Checking your session..." />;
  }

  if (sessionQuery.data) {
    const isAdmin = Boolean(meQuery.data?.profile?.is_admin);
    return <Navigate to={resolvePostAuthPath(undefined, isAdmin)} replace />;
  }

  return <Outlet />;
}
