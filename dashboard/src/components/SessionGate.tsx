import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ensureSessionChecked, getAuthedState, subscribeAuthed } from "@/api/client";

type SessionState = "checking" | "authed" | "anon";

/**
 * Cached session hook: /v1/admin/me runs once per page load and the result is
 * shared by every guard. Tab switches render instantly — no re-verification.
 */
function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(() => {
    const a = getAuthedState();
    return a === null ? "checking" : a ? "authed" : "anon";
  });

  useEffect(() => {
    if (getAuthedState() !== null) return;
    const unsub = subscribeAuthed((v) => setState(v ? "authed" : "anon"));
    ensureSessionChecked();
    return unsub;
  }, []);

  return state;
}

function VerifyingScreen() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="font-mono text-[11px] tracking-[0.24em] text-inkdim animate-pulse">VERIFYING SESSION…</div>
    </div>
  );
}

function SessionGate({ children }: { children: ReactNode }) {
  const state = useSession();
  const location = useLocation();
  if (state === "checking") return <VerifyingScreen />;
  if (state === "anon") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Wraps console pages — logged-out visitors are sent to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  return <SessionGate>{children}</SessionGate>;
}

/** Wraps /login — logged-in users are sent straight to the app board. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const state = useSession();
  const location = useLocation();
  if (state === "checking") return <VerifyingScreen />;
  if (state === "authed") return <Navigate to="/apps" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
