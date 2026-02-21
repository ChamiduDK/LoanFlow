import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  Building2,
  ChevronLeft,
  Database,
  FileCheck,
  Menu,
  Plus,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const adminNav = [
  { label: "Banks", icon: Building2, path: "/admin" },
  { label: "Loan Schemes", icon: Database, path: "/admin/schemes" },
  { label: "Eligibility Rules", icon: Shield, path: "/admin/rules" },
  { label: "Documents", icon: FileCheck, path: "/admin/documents" },
  { label: "Users", icon: Users, path: "/admin/users" },
];

export default function AdminLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const active = adminNav.find((item) => item.path === location.pathname) ?? adminNav[0];

  return (
    <div className="flex min-h-screen overflow-hidden app-shell-bg">
      {open && (
        <button
          type="button"
          aria-label="Close admin navigation"
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-[272px] -translate-x-full transition-transform duration-300 ease-out lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
          <div className="border-b border-sidebar-border/80 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-md">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
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
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  location.pathname === item.path
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-sidebar-border/80 p-3">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to App
            </Link>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-foreground">{active.label}</h1>
                <p className="hidden text-xs text-muted-foreground sm:block">Manage lenders, schemes, and underwriting rules</p>
              </div>
            </div>
            <Button className="hidden sm:inline-flex">
              <Plus className="h-4 w-4" />
              Add Record
            </Button>
            <Button className="sm:hidden" size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="page-shell px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
