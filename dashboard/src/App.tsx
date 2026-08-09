import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Menu, X } from "lucide-react";
import { api, clearSessionToken } from "@/api/client";
import { springLift } from "@/lib/motion";

export function Mark({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="RodeX">
      <path d="M32 6 L56 22 L32 58 L8 22 Z" fill="none" stroke="#E8E4DA" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 10 L52 22 M32 10 L12 22 M32 54 L52 42 M32 54 L12 42" stroke="#8A9184" strokeWidth="1.3" />
      <path d="M20 18 L44 42 M46 18 L22 42" stroke="#E8E4DA" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M40 40 v9 M44 43 v5 M36 43 v5" stroke="#D9B64A" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32" cy="32" r="2" fill="#E8452C" />
      <rect x="22" y="2" width="20" height="6" fill="#D9B64A" />
    </svg>
  );
}

const nav = [
  { to: "/apps", label: "APPS" },
  { to: "/docs", label: "DOCS" },
  { to: "/usage", label: "USAGE" },
];

export default function AppShell() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    clearSessionToken();
    try {
      await api.post("/v1/admin/logout", {});
    } catch {
      /* best effort — session token is already cleared client-side */
    }
    navigate("/login");
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `font-mono text-[11px] tracking-[0.18em] px-3 py-1.5 rounded-md transition-colors ${
      isActive ? "text-gold bg-panel2" : "text-inkdim hover:text-ink hover:bg-panel2"
    }`;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-line bg-bg/85 backdrop-blur">
          <Link to="/apps" className="flex items-center gap-3">
            <Mark />
            <span className="font-mono font-bold tracking-[0.22em] text-sm">
              RODEX<em className="text-gold not-italic">DB</em>
            </span>
          </Link>

          {/* desktop nav */}
          <nav className="ml-auto hidden sm:flex items-center gap-1">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkCls}>
                {n.label}
              </NavLink>
            ))}
            <button onClick={logout} className="font-mono text-[11px] tracking-[0.18em] px-3 py-1.5 rounded-md text-inkdim hover:text-ink hover:bg-panel2 ml-2">
              EXIT
            </button>
          </nav>

          {/* mobile menu toggle */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="ml-auto sm:hidden p-1.5 rounded-md text-inkdim hover:text-ink hover:bg-panel2"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* mobile nav panel */}
        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="sm:hidden border-b border-line bg-bg/95 overflow-hidden"
            >
              <div className="px-4 py-3 flex flex-col gap-1">
                {nav.map((n) => (
                  <NavLink key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className={linkCls}>
                    {n.label}
                  </NavLink>
                ))}
                <button onClick={logout} className="text-left font-mono text-[11px] tracking-[0.18em] px-3 py-1.5 rounded-md text-inkdim hover:text-ink hover:bg-panel2">
                  EXIT
                </button>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
          <Outlet />
        </main>

        <footer className="px-4 sm:px-5 py-4 border-t border-line flex flex-wrap gap-x-6 gap-y-1 justify-between font-mono text-[9.5px] sm:text-[10px] tracking-[0.16em] text-inkdim">
          <span>RODEX DB — GATEWAY CONSOLE</span>
          <span className="hidden md:inline">REV F · INSTRUMENT PACKET</span>
          <span>rodexdb.pages.dev</span>
        </footer>
      </div>
    </MotionConfig>
  );
}

export { springLift };