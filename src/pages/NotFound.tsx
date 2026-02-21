import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, SearchX } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
          <SearchX className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-semibold text-foreground">404</h1>
        <p className="mt-2 text-lg text-foreground">Page not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The route <code className="rounded bg-muted px-1 py-0.5">{location.pathname}</code> does not exist.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Return Home
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
