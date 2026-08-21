import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/5 mb-4">
            <AlertTriangle className="size-5 text-amber-500" />
          </div>
          <p className="text-sm font-medium text-foreground">Something went wrong</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {this.props.name ? `The ${this.props.name} encountered an error.` : "A component encountered an error."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-full"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCw className="mr-1.5 size-3.5" /> Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
