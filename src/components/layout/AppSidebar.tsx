import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Search,
  Calculator,
  Upload,
  GitBranch,
  Wallet,
  Settings,
  LogOut,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";
import { supabaseClient } from "@/lib/supabase/client";

type MePayload = {
  profile?: {
    is_admin?: boolean;
  } | null;
};

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Loan Application", icon: FileText, path: "/apply" },
  { label: "Loan Results", icon: Search, path: "/results" },
  { label: "EMI Calculator", icon: Calculator, path: "/calculator" },
  { label: "Documents", icon: Upload, path: "/documents" },
  { label: "Tracker", icon: GitBranch, path: "/tracker" },
  { label: "Loan Management", icon: Wallet, path: "/management" },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function AppSidebar({ open, onClose }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => apiFetch<MePayload>("/api/me"),
    retry: false,
    staleTime: 30_000,
  });
  const isAdmin = Boolean(meQuery.data?.profile?.is_admin);

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);

    try {
      await apiFetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        throw error;
      }

      onClose();
      navigate("/login", { replace: true });
    } catch (error) {
      toast({
        title: "Sign out failed",
        description: error instanceof Error ? error.message : "Could not sign out",
        variant: "destructive",
      });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[272px] -translate-x-full transition-transform duration-300 ease-out lg:static lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg">
          <div className="border-b border-sidebar-border/80 p-5">
            <Link to="/" className="block" onClick={onClose}>
              <div>
                <span className="block text-base font-semibold text-sidebar-foreground">LoanFlow</span>
                <span className="text-xs font-medium text-sidebar-foreground/60">Intelligent Lending</span>
              </div>
            </Link>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/70 px-3 py-2 text-xs text-sidebar-foreground/80">
              <Sparkles className="h-3.5 w-3.5 text-sidebar-foreground/70" />
              AI-powered matching
            </div>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50">
                Navigation
              </p>
              <div className="mt-3 space-y-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>

          <div className="space-y-1 border-t border-sidebar-border/80 p-3">
            {isAdmin ? (
              <Link
                to="/admin"
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              >
                <Settings className="h-4 w-4" />
                Admin Panel
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-70"
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
