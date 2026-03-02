import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { supabaseClient } from "@/lib/supabase/client";
import RequireAdmin from "@/components/auth/RequireAdmin";
import RequireAuth from "@/components/auth/RequireAuth";
import RequireApprovedUser from "@/components/auth/RequireApprovedUser";
import RequireGuest from "@/components/auth/RequireGuest";
import RouteFallback from "@/components/auth/RouteFallback";

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
    <Suspense fallback={<RouteFallback message="Loading page..." />}>
      <Routes>
        <Route path="/" element={<Index />} />

        <Route element={<RequireGuest />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/approval-pending" element={<ApprovalPending />} />

          <Route element={<RequireApprovedUser />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/chat" element={<AiChat />} />
              <Route path="/apply" element={<LoanApplication />} />
              <Route path="/results" element={<LoanResults />} />
              <Route path="/calculator" element={<EMICalculator />} />
              <Route path="/documents" element={<DocumentUpload />} />
              <Route path="/tracker" element={<ApplicationTracker />} />
              <Route path="/management" element={<LoanManagement />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/notifications" element={<Notifications />} />
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
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <ThemeToggle floating />
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
