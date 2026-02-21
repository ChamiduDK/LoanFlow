import { Navigate, Outlet } from "react-router-dom";
import RouteFallback from "./RouteFallback";
import { useAuthSession } from "@/hooks/useAuthSession";

export default function RequireGuest() {
  const sessionQuery = useAuthSession();

  if (sessionQuery.isLoading) {
    return <RouteFallback message="Checking your session..." />;
  }

  if (sessionQuery.data) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
