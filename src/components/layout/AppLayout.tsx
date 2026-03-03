import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import TopNav from "./TopNav";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "loanflow-sidebar-collapsed";

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  return (
    <div className="flex h-screen overflow-hidden app-shell-bg">
      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col h-screen overflow-hidden">
        <TopNav
          onMenuClick={() => setSidebarOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onDesktopSidebarToggle={() => setSidebarCollapsed((previous) => !previous)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="page-shell px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6 pb-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
