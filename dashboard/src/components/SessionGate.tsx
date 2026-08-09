import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ensureSessionChecked, getAuthedState, isExplicitLogout, subscribeAuthed } from "@/api/client";
import Loader from "@/components/Loader";

type SessionState = "checking" | "authed" | "anon";

/**
 * Cached session hook: /v1/admin/me runs once per page load and the result is
 * shared by every guard. Tab switches render instantly — no re-verification.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(() => {
    // A fresh explicit logout must NEVER bounce back — show /login immediately.
    if (isExplicitLogout()) return "anon";
    const a = getAuthedState();
    return a === null ? "checking" : a ? "authed" : "anon";
  });

  useEffect(() => {
    if (isExplicitLogout()) return;
    if (getAuthedState() !== null) return;
    const unsub = subscribeAuthed((v) => setState(v ? "authed" : "anon"));
    ensureSessionChecked();
    return unsub;
  }, []);

  return state;
}

function VerifyingScreen() {
  return <Loader label="VERIFYING SESSION" />;
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
