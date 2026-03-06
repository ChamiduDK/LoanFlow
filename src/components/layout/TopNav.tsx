import { useMemo, useState } from "react";
import { Bell, ChevronRight, Lock, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabaseClient } from "@/lib/supabase/client";
import { hasFeatureAccess, type UserFeatureKey } from "@/lib/feature-access";

interface TopNavProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
  onDesktopSidebarToggle: () => void;
}

type QuickLink = {
  label: string;
  path: string;
  keywords: string[];
  featureKey?: UserFeatureKey;
};

const USER_QUICK_LINKS: QuickLink[] = [
  { label: "Dashboard", path: "/dashboard", keywords: ["home", "summary", "overview"] },
  { label: "Loan Application", path: "/apply", keywords: ["new", "create", "form"], featureKey: "new_application" },
  { label: "Loan Recommendations", path: "/results", keywords: ["results", "matches", "banks"] },
  { label: "EMI Calculator", path: "/calculator", keywords: ["emi", "repayment", "calculate"], featureKey: "emi_calculator" },
  { label: "Document Upload", path: "/documents", keywords: ["files", "verification", "checklist"], featureKey: "upload_documents" },
  { label: "Application Tracker", path: "/tracker", keywords: ["timeline", "status", "progress"], featureKey: "track_application" },
  { label: "Loan Management", path: "/management", keywords: ["repayment", "installments", "dues"] },
];

const ADMIN_QUICK_LINKS: QuickLink[] = [
  { label: "Admin Overview", path: "/admin", keywords: ["admin", "overview"] },
  { label: "Admin Applications", path: "/admin/applications", keywords: ["admin", "applications"] },
  { label: "Admin Banks", path: "/admin/banks", keywords: ["admin", "banks"] },
  { label: "Admin Schemes", path: "/admin/schemes", keywords: ["admin", "schemes", "products"] },
  { label: "Admin Rules", path: "/admin/rules", keywords: ["admin", "rules"] },
  { label: "Admin Documents", path: "/admin/documents", keywords: ["admin", "documents"] },
  { label: "Admin Users", path: "/admin/users", keywords: ["admin", "users"] },
  { label: "Admin Audit Logs", path: "/admin/audit-logs", keywords: ["admin", "audit", "logs"] },
];

export default function TopNav({ onMenuClick, sidebarCollapsed, onDesktopSidebarToggle }: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [searchValue, setSearchValue] = useState("");
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () =>
      apiFetch<{ profile?: { full_name?: string | null; email?: string | null; is_admin?: boolean; feature_access?: Record<string, boolean> | null } | null }>("/api/me"),
    retry: false,
    staleTime: 60_000,
  });

  const userLabel = meQuery.data?.profile?.full_name?.trim() || meQuery.data?.profile?.email || "Account";
  const isAdmin = Boolean(meQuery.data?.profile?.is_admin);
  const canCreateApplication = hasFeatureAccess(meQuery.data?.profile, "new_application");

  const quickLinks = useMemo(
    () => {
      const allowedUserLinks = USER_QUICK_LINKS.filter((item) => !item.featureKey || hasFeatureAccess(meQuery.data?.profile, item.featureKey));
      return isAdmin ? [...allowedUserLinks, ...ADMIN_QUICK_LINKS] : allowedUserLinks;
    },
    [isAdmin, meQuery.data?.profile],
  );

  const filteredQuickLinks = useMemo(() => {
    const normalized = searchValue.trim().toLowerCase();
    if (!normalized) {
      return quickLinks.filter((item) => item.path !== location.pathname).slice(0, 6);
    }

    return quickLinks
      .filter((item) => {
        if (item.path === location.pathname) {
          return false;
        }
        return (
          item.label.toLowerCase().includes(normalized) ||
          item.path.toLowerCase().includes(normalized) ||
          item.keywords.some((keyword) => keyword.includes(normalized))
        );
      })
      .slice(0, 6);
  }, [location.pathname, quickLinks, searchValue]);

  const navigateTo = (path: string) => {
    navigate(path);
    setSearchValue("");
    setIsQuickNavOpen(false);
  };

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
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-6 lg:px-8">
        <Button variant="outline" size="icon" className="shrink-0 lg:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="hidden shrink-0 lg:inline-flex"
          onClick={onDesktopSidebarToggle}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>

        <div className="relative hidden min-w-0 max-w-xl flex-1 items-center gap-2 md:flex">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
                setIsQuickNavOpen(true);
              }}
              onFocus={() => setIsQuickNavOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setIsQuickNavOpen(false), 120);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const next = filteredQuickLinks[0];
                  if (next) {
                    event.preventDefault();
                    navigateTo(next.path);
                  }
                }
              }}
              className="border-border bg-muted/50 pl-9 focus-visible:bg-background"
              placeholder="Quick navigate: dashboard, tracker, documents..."
            />
          </div>
          {isQuickNavOpen && filteredQuickLinks.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 rounded-xl border border-border/70 bg-card p-2 shadow-lg">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Quick Navigation
              </p>
              <div className="space-y-1">
                {filteredQuickLinks.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onMouseDown={() => navigateTo(item.path)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      item.path === location.pathname
                        ? "bg-muted text-muted-foreground"
                        : "hover:bg-muted/70",
                    )}
                    disabled={item.path === location.pathname}
                  >
                    <span className="font-medium text-foreground">{item.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {isAdmin ? (
            <Button asChild variant="outline" className="hidden lg:inline-flex">
              <Link to="/admin">
                <Settings className="h-4 w-4" />
                Admin Panel
              </Link>
            </Button>
          ) : null}

          <Button
            variant="outline"
            className="hidden md:inline-flex"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Signing out..." : "Sign Out"}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">{signingOut ? "Signing out..." : "Sign Out"}</span>
          </Button>

          {canCreateApplication ? (
            <>
              <Button asChild className="hidden sm:inline-flex">
                <Link to="/apply">
                  <Plus className="h-4 w-4" />
                  New Application
                </Link>
              </Button>
              <Button asChild variant="outline" size="icon" className="sm:hidden">
                <Link to="/apply">
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">New Application</span>
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button disabled className="hidden sm:inline-flex" title="Admin must enable new application access">
                <Lock className="h-4 w-4" />
                New Application
              </Button>
              <Button disabled variant="outline" size="icon" className="sm:hidden" title="Admin must enable new application access">
                <Lock className="h-4 w-4" />
                <span className="sr-only">New Application locked</span>
              </Button>
            </>
          )}
          <Button asChild variant="ghost" size="icon" className="relative hover:bg-muted">
            <Link to="/notifications" aria-label="Open notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-info animate-pulse" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 rounded-lg px-2 sm:px-3 hover:bg-muted">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="hidden text-sm font-medium text-foreground xl:inline">{userLabel}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
