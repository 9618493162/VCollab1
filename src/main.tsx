import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation, useParams } from "react-router";
import "./index.css";

// Routes are static imports: in the sandboxed preview, a rotated dev session
// makes per-route dynamic-import fetches fail with "Failed to fetch dynamically
// imported module". Static imports bundle everything up front, so navigation
// never depends on a fresh module URL. Production code-splitting is preserved
// by the manualChunks config in vite.config.ts.
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Call from "./pages/Call";
import History from "./pages/History";
import { PostMeetingPage } from "./components/PostMeetingPage";
import SettingsPage from "./pages/Settings";
import Collab from "./pages/Collab";
import Calendar from "./pages/Calendar";
import SearchPage from "./pages/Search";
import Workspaces from "./pages/Workspaces";
import WorkspaceDetail from "./pages/WorkspaceDetail";
import Messages from "./pages/Messages";
import Help from "./pages/Help";
import Admin from "./pages/Admin";
import Contacts from "./pages/Contacts";
import NotFound from "./pages/NotFound";
import { CommandPalette } from "./components/CommandPalette";
import { OnboardingWizard } from "./components/OnboardingWizard";
import UploadApkPage from "./pages/UploadApk";

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Freebuff injects VITE_CONVEX_URL at build time, but older published builds
// carried a stale deployment URL (optimistic-lemur-110) that has none of the
// Keys-tab env vars and generates OAuth callbacks on the wrong host — that
// breaks Google/GitHub sign-in with `invalid_client` (client_id=undefined).
// The project's managed Convex deployment is secret-bird-498: that's where
// `convex dev`/`deploy` push code, where VLY_CONVEX_AUTH_ISSUER points, where
// the Keys-tab env vars live, and where the OAuth callbacks are registered.
// Prefer it unless the injected URL already targets it.
const MANAGED_CONVEX_URL = "https://secret-bird-498.convex.cloud";
const injectedUrl = import.meta.env.VITE_CONVEX_URL;
const convexUrl =
  injectedUrl && injectedUrl.includes("secret-bird-498.convex.cloud")
    ? injectedUrl
    : MANAGED_CONVEX_URL;
const convex = new ConvexReactClient(convexUrl);

function PostMeetingPageWrapper() {
  const { code } = useParams<{ code: string }>();
  if (!code) return <NotFound />;
  return <PostMeetingPage code={code} />;
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <BrowserRouter>
            <RouteSyncer />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/history"
                element={
                  <RequireAuth>
                    <History />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireAuth>
                    <SettingsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/collab/:code"
                element={
                  <RequireAuth>
                    <Collab />
                  </RequireAuth>
                }
              />
              <Route
                path="/calendar"
                element={
                  <RequireAuth>
                    <Calendar />
                  </RequireAuth>
                }
              />
              <Route
                path="/search"
                element={
                  <RequireAuth>
                    <SearchPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/workspaces"
                element={
                  <RequireAuth>
                    <Workspaces />
                  </RequireAuth>
                }
              />
              <Route
                path="/workspaces/:workspaceId"
                element={
                  <RequireAuth>
                    <WorkspaceDetail />
                  </RequireAuth>
                }
              />
              <Route
                path="/messages"
                element={
                  <RequireAuth>
                    <Messages />
                  </RequireAuth>
                }
              />
              <Route
                path="/help"
                element={
                  <RequireAuth>
                    <Help />
                  </RequireAuth>
                }
              />
              <Route
                path="/contacts"
                element={
                  <RequireAuth>
                    <Contacts />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <Admin />
                  </RequireAuth>
                }
              />
              {/* Public on purpose: anyone with a link can join a call — no
                  account needed on their side. Starting meetings stays gated
                  behind /dashboard's RequireAuth. `/join/:code` is the
                  shareable link form (both routes resolve through the backend
                  before any access is granted). */}
              <Route
                path="/meeting/:code/analysis"
                element={
                  <RequireAuth>
                    <PostMeetingPageWrapper />
                  </RequireAuth>
                }
              />
              <Route path="/call/:code" element={<Call />} />
              <Route path="/join/:code" element={<Call />} />
              <Route path="/download" element={<UploadApkPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <CommandPalette />
            <OnboardingWizard />
          </BrowserRouter>
          <Toaster />
        </ThemeProvider>
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
