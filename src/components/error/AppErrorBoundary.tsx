import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled route render error", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
          <Card className="w-full max-w-xl border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Page failed to load
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                An unexpected runtime error blocked this page. Reload the app to recover.
              </p>
              <Button onClick={this.handleReload}>
                <RefreshCcw className="h-4 w-4" />
                Reload App
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
