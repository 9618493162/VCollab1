import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect } from "react";

/**
 * Keeps the signed-in user's status presence fresh for as long as a page
 * that mounts this hook is open: marks "available" on load/focus, "away"
 * when the tab is hidden, "offline" on unload, and heartbeats every 60s.
 */
export function usePresence() {
  const setStatus = useMutation(api.presence.setStatus);
  const heartbeat = useMutation(api.presence.heartbeat);

  useEffect(() => {
    void setStatus({ status: "available" });

    const beat = setInterval(() => {
      void heartbeat();
    }, 60_000);

    const onVisibility = () => {
      void setStatus({ status: document.hidden ? "away" : "available" });
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onUnload = () => {
      void setStatus({ status: "offline" });
    };
    window.addEventListener("pagehide", onUnload);

    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onUnload);
      void setStatus({ status: "offline" });
    };
  }, [setStatus, heartbeat]);
}
