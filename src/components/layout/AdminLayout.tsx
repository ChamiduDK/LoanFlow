import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  ChevronLeft,
  Database,
  FileCheck,
  FolderCheck,
  Menu,
  Shield,
  Users,
  ScrollText,
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const adminNav = [
  { label: "Overview", icon: LayoutDashboard, path: "/admin" },
  { label: "Banks", icon: Building2, path: "/admin/banks" },
  { label: "Loan Schemes", icon: Database, path: "/admin/schemes" },
  { label: "Eligibility Rules", icon: Shield, path: "/admin/rules" },
  { label: "Documents", icon: FileCheck, path: "/admin/documents" },
  { label: "Applications", icon: FolderCheck, path: "/admin/applications" },
  { label: "Users", icon: Users, path: "/admin/users" },
  { label: "Audit Logs", icon: ScrollText, path: "/admin/audit-logs" },
  { label: "ML Models", icon: Cpu, path: "/admin/ml" },
];

const ADMIN_SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed";

export default function AdminLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const active =
    adminNav.find((item) =>
      item.path === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(item.path),
    ) ?? adminNav[0];

  useEffect(() => {
    const storedValue = window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY);
    setCollapsed(storedValue === "1");
  }, []);

  const toggleDesktopCollapse = () => {
    setCollapsed((previous) => {
      const next = !previous;
      window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="flex min-h-screen app-shell-bg">
      {open && (
        <button
          type="button"
          aria-label="Close admin navigation"
          className="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[1px] lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-[272px] -translate-x-full transition-all duration-300 ease-out lg:static lg:shrink-0 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
        collapsed ? "lg:w-[88px]" : "lg:w-[272px]",
      )}>
        <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg">
          <div className="border-b border-sidebar-border/80 p-5">
            <div className={cn("flex items-center gap-3", collapsed ? "lg:justify-center" : "")}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
                <Building2 className="h-5 w-5" />
              </div>
              <div className={cn(collapsed ? "lg:hidden" : "")}>
                <h2 className="text-base font-semibold text-sidebar-foreground">LankaLoan Admin</h2>
                <p className="text-xs text-sidebar-foreground/60">Credit Ops Console</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {adminNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed ? "lg:justify-center lg:px-2.5" : "",
                  (item.path === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(item.path))
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className={cn(collapsed ? "lg:hidden" : "")}>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="border-t border-sidebar-border/80 p-3">
            <Link
              to="/dashboard"
              title={collapsed ? "Back to App" : undefined}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className={cn(collapsed ? "lg:hidden" : "")}>Back to App</span>
            </Link>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 border-b border-border/70 bg-background/95">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={toggleDesktopCollapse}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-foreground">{active.label}</h1>
                <p className="hidden text-xs text-muted-foreground sm:block">Production administration console</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">
                <span className="hidden sm:inline">Open User App</span>
                <span className="sm:hidden">User App</span>
              </Link>
            </Button>
          </div>
        </header>
        <main className="flex-1">
          <div className="page-shell px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pt-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
