import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, type MeResult } from "@/api/client";

type SessionState = "checking" | "authed" | "anon";

function useSession(): SessionState {
  const [state, setState] = useState<SessionState>("checking");
  useEffect(() => {
    let alive = true;
    api
      .get<MeResult>("/v1/admin/me")
      .then((r) => alive && setState(r.authenticated ? "authed" : "anon"))
      .catch(() => alive && setState("anon"));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function SessionGate({ children }: { children: ReactNode }) {
  const state = useSession();
  const location = useLocation();
  if (state === "checking") {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="font-mono text-[11px] tracking-[0.24em] text-inkdim animate-pulse">VERIFYING SESSION…</div>
      </div>
    );
  }
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
  if (state === "checking") {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="font-mono text-[11px] tracking-[0.24em] text-inkdim animate-pulse">VERIFYING SESSION…</div>
      </div>
    );
  }
  if (state === "authed") return <Navigate to="/apps" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
