import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import AppsPage from "@/pages/AppsPage";
import AppDetailPage from "@/pages/AppDetailPage";
import DocsPage from "@/pages/DocsPage";
import UsagePage from "@/pages/UsagePage";
import AppShell, { Mark } from "./App";

function AuthGate({ children }: { children: React.ReactNode }) {
  // The gateway enforces sessions; the dashboard treats 401s as "go log in".
  // Keeping this light: routes render freely, API errors direct the user.
  return <>{children}</>;
}

export function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="text-center">
        <Mark className="w-12 h-12 mx-auto mb-4" />
        <div className="font-mono text-lg tracking-[0.1em]">404 — NO SUCH INSTRUMENT</div>
        <a href="/apps" className="font-mono text-[12px] tracking-[0.14em] text-gold underline mt-3 inline-block">
          RETURN TO APP BOARD
        </a>
      </div>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <AuthGate>
            <AppShell />
          </AuthGate>
        }
      >
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/apps/:id" element={<AppDetailPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/usage" element={<UsagePage />} />
      </Route>
      <Route path="/" element={<Navigate to="/apps" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
