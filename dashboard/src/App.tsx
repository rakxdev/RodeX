import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "@/api/client";

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

export default function App() {
  const navigate = useNavigate();

  async function logout() {
    try {
      await api.post("/v1/admin/logout");
    } catch {
      /* best effort */
    }
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-line bg-bg/80 backdrop-blur">
        <Link to="/apps" className="flex items-center gap-3">
          <Mark />
          <span className="font-mono font-bold tracking-[0.22em] text-sm">
            RODEX<em className="text-gold not-italic">DB</em>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `font-mono text-[11px] tracking-[0.18em] px-3 py-1.5 rounded-md transition-colors ${
                  isActive ? "text-gold bg-panel2" : "text-inkdim hover:text-ink hover:bg-panel2"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
          <button onClick={logout} className="font-mono text-[11px] tracking-[0.18em] px-3 py-1.5 rounded-md text-inkdim hover:text-ink hover:bg-panel2 ml-2">
            EXIT
          </button>
        </nav>
      </header>
      <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-8">
        <Outlet />
      </main>
      <footer className="px-5 py-4 border-t border-line flex flex-wrap gap-x-6 gap-y-1 justify-between font-mono text-[10px] tracking-[0.16em] text-inkdim">
        <span>RODEX DB — GATEWAY CONSOLE</span>
        <span>REV F · INSTRUMENT PACKET</span>
        <span>rodexdb.pages.dev</span>
      </footer>
    </div>
  );
}
