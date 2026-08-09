import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import LoginPage from "@/pages/LoginPage";
import AppsPage from "@/pages/AppsPage";
import AppDetailPage from "@/pages/AppDetailPage";
import DocsPage from "@/pages/DocsPage";
import UsagePage from "@/pages/UsagePage";
import AppShell, { Mark } from "./App";

export function NotFound() {
  return (
    <div className="min-h-[55vh] grid place-items-center">
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
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppShell />}>
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/apps/:id" element={<AppDetailPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/usage" element={<UsagePage />} />
        </Route>
        <Route path="/" element={<Navigate to="/apps" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
}
