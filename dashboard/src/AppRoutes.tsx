import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import AppsPage from "@/pages/AppsPage";
import AppDetailPage from "@/pages/AppDetailPage";
import DocsPage from "@/pages/DocsPage";
import UsagePage from "@/pages/UsagePage";
import { RequireAuth, PublicOnly } from "@/components/SessionGate";
import AppShell, { Mark } from "./App";

export function NotFound() {
  return (
    <div className="min-h-[55vh] grid place-items-center">
      <div className="text-center">
        <Mark className="w-12 h-12 mx-auto mb-4" />
        <div className="font-mono text-lg tracking-[0.1em]">404 — NO SUCH INSTRUMENT</div>
        <a href="/" className="font-mono text-[12px] tracking-[0.14em] text-gold underline mt-3 inline-block">
          RETURN TO BASE
        </a>
      </div>
    </div>
  );
}

export default function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/apps/:id" element={<AppDetailPage />} />
        </Route>
        <Route path="/usage" element={<UsagePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
}
