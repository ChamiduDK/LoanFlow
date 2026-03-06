import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { supabaseClient } from "@/lib/supabase/client";
import RequireAdmin from "@/components/auth/RequireAdmin";
import RequireAuth from "@/components/auth/RequireAuth";
import RequireApprovedUser from "@/components/auth/RequireApprovedUser";
import RequireFeatureAccess from "@/components/auth/RequireFeatureAccess";
import RequireGuest from "@/components/auth/RequireGuest";
import RouteFallback from "@/components/auth/RouteFallback";
import AppErrorBoundary from "@/components/error/AppErrorBoundary";

const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ApprovalPending = lazy(() => import("./pages/ApprovalPending"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AiChat = lazy(() => import("./pages/AiChat"));
const LoanApplication = lazy(() => import("./pages/LoanApplication"));
const LoanResults = lazy(() => import("./pages/LoanResults"));
const EMICalculator = lazy(() => import("./pages/EMICalculator"));
const DocumentUpload = lazy(() => import("./pages/DocumentUpload"));
const ApplicationTracker = lazy(() => import("./pages/ApplicationTracker"));
const LoanManagement = lazy(() => import("./pages/LoanManagement"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const BankAgentAccess = lazy(() => import("./pages/BankAgentAccess"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminBanks = lazy(() => import("./pages/admin/AdminBanks"));
const AdminSchemes = lazy(() => import("./pages/admin/AdminSchemes"));
const AdminRules = lazy(() => import("./pages/admin/AdminRules"));
const AdminDocuments = lazy(() => import("./pages/admin/AdminDocuments"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AdminAuditLogs"));
const AdminApplications = lazy(() => import("./pages/admin/AdminApplications"));
const AdminML = lazy(() => import("./pages/admin/AdminML"));
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const AdminLayout = lazy(() => import("./components/layout/AdminLayout"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();
const useHashRouter = import.meta.env.VITE_ROUTER_MODE === "hash";
const routerBasename =
  !useHashRouter && import.meta.env.BASE_URL !== "/"
    ? import.meta.env.BASE_URL.replace(/\/$/, "")
    : undefined;
const Router = useHashRouter ? HashRouter : BrowserRouter;

function AppRoutes() {
  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(() => {
      void queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      void queryClient.invalidateQueries({ queryKey: ["me-profile"] });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AppErrorBoundary>
      <Suspense fallback={<RouteFallback message="Loading page..." />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/bank-agent-access/:token" element={<BankAgentAccess />} />

          <Route element={<RequireGuest />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/approval-pending" element={<ApprovalPending />} />

            <Route element={<RequireApprovedUser />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/results" element={<LoanResults />} />
                <Route path="/management" element={<LoanManagement />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/notifications" element={<Notifications />} />

                <Route element={<RequireFeatureAccess featureKey="new_application" />}>
                  <Route path="/apply" element={<LoanApplication />} />
                </Route>
                <Route element={<RequireFeatureAccess featureKey="emi_calculator" />}>
                  <Route path="/calculator" element={<EMICalculator />} />
                </Route>
                <Route element={<RequireFeatureAccess featureKey="upload_documents" />}>
                  <Route path="/documents" element={<DocumentUpload />} />
                </Route>
                <Route element={<RequireFeatureAccess featureKey="track_application" />}>
                  <Route path="/tracker" element={<ApplicationTracker />} />
                </Route>
              </Route>

              <Route element={<RequireFeatureAccess featureKey="ai_chat" />}>
                <Route path="/chat" element={<AiChat />} />
              </Route>
            </Route>
          </Route>

          <Route element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/banks" element={<AdminBanks />} />
              <Route path="/admin/schemes" element={<AdminSchemes />} />
              <Route path="/admin/rules" element={<AdminRules />} />
              <Route path="/admin/documents" element={<AdminDocuments />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/applications" element={<AdminApplications />} />
              <Route path="/admin/ml" element={<AdminML />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false} disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Router basename={routerBasename}>
          <AppRoutes />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
