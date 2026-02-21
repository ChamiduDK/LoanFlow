import { Bell, Menu, Plus, Search, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";

interface TopNavProps {
  onMenuClick: () => void;
}

export default function TopNav({ onMenuClick }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-6 lg:px-8">
        <Button variant="outline" size="icon" className="shrink-0 lg:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>

        <Link to="/" className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-foreground sm:text-base">SME Loan Hub</span>
        </Link>

        <div className="hidden min-w-0 max-w-lg flex-1 items-center gap-2 md:flex">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="border-border bg-muted/50 pl-9 focus-visible:bg-background"
              placeholder="Search applications, banks, IDs..."
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
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
          <Button variant="ghost" size="icon" className="relative hover:bg-muted">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-info animate-pulse" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 rounded-lg px-2 sm:px-3 hover:bg-muted">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="hidden text-sm font-medium text-foreground xl:inline">Kamal Perera</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
