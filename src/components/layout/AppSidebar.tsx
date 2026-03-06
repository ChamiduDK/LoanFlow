import { useEffect } from "react";
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
  User,
  Bell,
  ChevronRight,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { apiFetch } from "@/lib/api/client";
import { hasFeatureAccess, type UserFeatureKey } from "@/lib/feature-access";

const navItems = [
  {
    group: "Main",
    items: [
      { label: "Dashboard", description: "Overview & quick actions", icon: LayoutDashboard, path: "/dashboard" },
      { label: "Loan Application", description: "Create or update your request", icon: FileText, path: "/apply", featureKey: "new_application" as UserFeatureKey },
      { label: "Loan Results", description: "View ranked lender matches", icon: Search, path: "/results" },
    ],
  },
  {
    group: "Tools",
    items: [
      { label: "EMI Calculator", description: "Estimate monthly repayment", icon: Calculator, path: "/calculator", featureKey: "emi_calculator" as UserFeatureKey },
      { label: "Documents", description: "Upload & verify required files", icon: Upload, path: "/documents", featureKey: "upload_documents" as UserFeatureKey },
      { label: "Tracker", description: "Track bank decision flow", icon: GitBranch, path: "/tracker", featureKey: "track_application" as UserFeatureKey },
      { label: "Loan Management", description: "Manage approved repayments", icon: Wallet, path: "/management" },
    ],
  },
  {
    group: "Account",
    items: [
      { label: "Profile", description: "Business Info & Settings", icon: User, path: "/profile" },
      { label: "Notifications", description: "Alerts and account activity", icon: Bell, path: "/notifications" },
    ],
  },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
}

export default function AppSidebar({ open, onClose, collapsed }: AppSidebarProps) {
  const location = useLocation();
  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () =>
      apiFetch<{ profile?: { is_admin?: boolean; feature_access?: Record<string, boolean> | null } | null }>("/api/me"),
    retry: false,
    staleTime: 60_000,
  });
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
          "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[300px] -translate-x-full transition-transform duration-300 ease-out lg:static lg:shrink-0 lg:translate-x-0 lg:transition-[width] lg:duration-300",
          collapsed ? "lg:w-[88px]" : "lg:w-[272px]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Sidebar"
      >
        <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          {/* Brand */}
          <div className={cn("border-b border-sidebar-border/60 px-5 pb-5 pt-5", collapsed && "lg:px-3")}>
            <Link to="/" className={cn("flex items-center group", collapsed && "lg:justify-center")} onClick={onClose}>
              <img
                src={logo}
                alt="LoanFlow"
                className={cn("h-9 w-auto object-contain transition-all", collapsed && "lg:h-8 lg:w-8")}
              />
            </Link>
          </div>

          {/* Nav */}
          <nav className={cn("flex-1 overflow-y-auto px-3 py-4 space-y-6", collapsed && "lg:px-2")}>
            {navItems.map((group) => (
              <div key={group.group}>
                <p
                  className={cn(
                    "px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/40",
                    collapsed && "lg:hidden"
                  )}
                >
                  {group.group}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    item.featureKey && !hasFeatureAccess(meQuery.data?.profile, item.featureKey) ? (
                      <div
                        key={item.path}
                        title="Access is controlled by admin"
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/40",
                          collapsed && "lg:justify-center lg:px-0",
                        )}
                      >
                        <item.icon className={cn("h-4 w-4 shrink-0", collapsed && "lg:h-5 lg:w-5")} />
                        <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
                          <p className="truncate text-sm font-semibold leading-none">{item.label}</p>
                          <p className="truncate text-[11px] opacity-70 mt-0.5 leading-none">Admin access required</p>
                        </div>
                        <Lock className={cn("h-3.5 w-3.5 shrink-0 opacity-60", collapsed && "lg:hidden")} />
                      </div>
                    ) : (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        title={item.label}
                        className={({ isActive }) =>
                          cn(
                            "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                            collapsed && "lg:justify-center lg:px-0",
                            isActive
                              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )
                        }
                      >
                        <item.icon className={cn("h-4 w-4 shrink-0", collapsed && "lg:h-5 lg:w-5")} />
                        <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
                          <p className="truncate text-sm font-semibold leading-none">{item.label}</p>
                          <p className="truncate text-[11px] opacity-70 mt-0.5 leading-none">{item.description}</p>
                        </div>
                        <ChevronRight className={cn("h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity", collapsed && "lg:hidden")} />
                      </NavLink>
                    )
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="border-t border-sidebar-border/60 px-4 py-3">
            <img src={logo} alt="LoanFlow" className={cn("mx-auto h-5 w-auto object-contain opacity-80", collapsed && "lg:h-7 lg:w-7")} />
            <p className={cn("mt-1 text-[10px] text-center text-sidebar-foreground/30 font-medium", collapsed && "lg:hidden")}>&copy; 2026 LoanFlow | SME Lending</p>
          </div>
        </div>
      </aside>
    </>
  );
}
