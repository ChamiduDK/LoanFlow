import { Navigate, Outlet, useLocation } from "react-router-dom";
import RouteFallback from "./RouteFallback";
import { useAuthSession } from "@/hooks/useAuthSession";

export default function RequireAuth() {
  const location = useLocation();
  const sessionQuery = useAuthSession();

  if (sessionQuery.isLoading) {
    return <RouteFallback message="Checking your session..." />;
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

  return <Outlet />;
}
