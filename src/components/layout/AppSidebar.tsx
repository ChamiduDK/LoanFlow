import { Link, useLocation } from "react-router-dom";
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
  Building2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[272px] -translate-x-full transition-transform duration-300 ease-out lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
          <div className="border-b border-sidebar-border/80 p-5">
            <Link to="/" className="flex items-center gap-3 transition-transform duration-300 hover:scale-105" onClick={onClose}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-blue-500 shadow-lg">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="block text-base font-bold bg-gradient-to-r from-sidebar-foreground to-sidebar-foreground/80 bg-clip-text text-transparent">SME Loan Hub</span>
                <span className="text-xs text-sidebar-foreground/60 font-medium">Intelligent Lending</span>
              </div>
            </Link>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/50 px-3 py-2 text-xs text-sidebar-foreground/80 transition-all hover:bg-sidebar-accent/70">
              <Sparkles className="h-3.5 w-3.5 text-sidebar-primary animate-pulse" />
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
                          ? "bg-gradient-to-r from-sidebar-primary to-blue-600 text-sidebar-primary-foreground shadow-md"
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
            <Link
              to="/admin"
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <Settings className="h-4 w-4" />
              Admin Panel
            </Link>
            <Link
              to="/"
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <LogOut className="h-4 w-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
