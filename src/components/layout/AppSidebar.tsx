import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Search,
  Calculator,
  Upload,
  GitBranch,
  Wallet,
  Sparkles,
  User,
  Bell,
  ChevronRight,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api/client";

type MePayload = {
  profile?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
};

const navItems = [
  {
    group: "Main",
    items: [
      { label: "Dashboard", description: "Overview & AI Chat", icon: LayoutDashboard, path: "/dashboard" },
      { label: "Loan Application", description: "Create or update your request", icon: FileText, path: "/apply" },
      { label: "Loan Results", description: "View ranked lender matches", icon: Search, path: "/results" },
    ],
  },
  {
    group: "Tools",
    items: [
      { label: "EMI Calculator", description: "Estimate monthly repayment", icon: Calculator, path: "/calculator" },
      { label: "Documents", description: "Upload & verify required files", icon: Upload, path: "/documents" },
      { label: "Tracker", description: "Track bank decision flow", icon: GitBranch, path: "/tracker" },
      { label: "Loan Management", description: "Manage approved repayments", icon: Wallet, path: "/management" },
    ],
  },
  {
    group: "Account",
    items: [
      { label: "Profile", description: "Business info & settings", icon: User, path: "/profile" },
      { label: "Notifications", description: "Alerts & activity", icon: Bell, path: "/notifications" },
    ],
  },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function AppSidebar({ open, onClose }: AppSidebarProps) {
  const location = useLocation();
  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => apiFetch<MePayload>("/api/me"),
    retry: false,
    staleTime: 30_000,
  });

  const profile = meQuery.data?.profile;
  const accountLabel = useMemo(() => {
    return profile?.full_name?.trim() || profile?.email || "My Account";
  }, [profile]);

  const initials = useMemo(() => {
    const name = profile?.full_name?.trim();
    if (name) {
      return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
    }
    return (profile?.email?.[0] ?? "U").toUpperCase();
  }, [profile]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[300px] -translate-x-full transition-transform duration-300 ease-out lg:static lg:w-[272px] lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Sidebar"
      >
        <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          {/* Brand */}
          <div className="border-b border-sidebar-border/60 px-5 pb-4 pt-5">
            <Link to="/" className="flex items-center gap-2.5 group" onClick={onClose}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <span className="block text-sm font-bold text-sidebar-foreground leading-none">LoanFlow</span>
                <span className="block text-[10px] font-medium text-sidebar-foreground/50 leading-none mt-0.5">AI-Powered Lending</span>
              </div>
            </Link>

            {/* User Card */}
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/50 px-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">{accountLabel}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-sidebar-foreground/50 font-medium">Active</span>
                </div>
              </div>
            </div>

            {/* AI Badge */}
            <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span className="text-[11px] font-medium text-sidebar-foreground/70">Gemini AI · Real-time matching</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            {navItems.map((group) => (
              <div key={group.group}>
                <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/40">
                  {group.group}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-none">{item.label}</p>
                        <p className="truncate text-[11px] opacity-70 mt-0.5 leading-none">{item.description}</p>
                      </div>
                      <ChevronRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="border-t border-sidebar-border/60 px-4 py-3">
            <p className="text-[10px] text-center text-sidebar-foreground/30 font-medium">LoanFlow © 2025 · SME Lending</p>
          </div>
        </div>
      </aside>
    </>
  );
}
