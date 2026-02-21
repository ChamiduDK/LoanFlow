import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import LoanApplication from "./pages/LoanApplication";
import LoanResults from "./pages/LoanResults";
import EMICalculator from "./pages/EMICalculator";
import DocumentUpload from "./pages/DocumentUpload";
import ApplicationTracker from "./pages/ApplicationTracker";
import LoanManagement from "./pages/LoanManagement";
import AdminBanks from "./pages/admin/AdminBanks";
import AppLayout from "./components/layout/AppLayout";
import AdminLayout from "./components/layout/AdminLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          
          {/* App routes with sidebar layout */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/apply" element={<LoanApplication />} />
            <Route path="/results" element={<LoanResults />} />
            <Route path="/calculator" element={<EMICalculator />} />
            <Route path="/documents" element={<DocumentUpload />} />
            <Route path="/tracker" element={<ApplicationTracker />} />
            <Route path="/management" element={<LoanManagement />} />
          </Route>

          {/* Admin routes */}
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminBanks />} />
            <Route path="/admin/schemes" element={<AdminBanks />} />
            <Route path="/admin/rules" element={<AdminBanks />} />
            <Route path="/admin/documents" element={<AdminBanks />} />
            <Route path="/admin/users" element={<AdminBanks />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
