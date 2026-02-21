import { Bell, Menu, Plus, Search, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";

interface TopNavProps {
  onMenuClick: () => void;
}

export default function TopNav({ onMenuClick }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button variant="outline" size="icon" className="lg:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>

        <Link to="/" className="flex items-center gap-2 font-semibold text-lg text-primary hidden sm:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">SME Loan Hub</span>
        </Link>

        <div className="hidden max-w-md flex-1 items-center gap-2 lg:flex">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 bg-muted/50 border-0 focus:bg-background" placeholder="Search applications, banks, IDs..." />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild className="hidden sm:inline-flex bg-primary hover:bg-primary/90">
            <Link to="/apply">
              <Plus className="h-4 w-4" />
              New Application
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="relative hover:bg-muted">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-info animate-pulse" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 rounded-lg px-2 sm:px-3 hover:bg-muted">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-600">
              <User className="h-4 w-4 text-white" />
            </div>
            <span className="hidden text-sm font-medium text-foreground sm:inline">Kamal Perera</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
