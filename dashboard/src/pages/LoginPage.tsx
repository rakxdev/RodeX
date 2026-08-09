import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Server, ShieldCheck } from "lucide-react";
import { api, setSessionToken, gatewayBase, ApiError } from "@/api/client";
import { Mark } from "@/App";
import { pageTransition } from "@/lib/motion";
import { FoldButton, FoldLink } from "@/components/FoldButton";

const SPEC = [
  { icon: Lock, label: "SESSION LOCK", value: "12H TTL · HMAC" },
  { icon: ShieldCheck, label: "TRANSPORT", value: "TLS 1.3 · HSTS" },
  { icon: Server, label: "LINK", value: "workers.dev" },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ session?: string }>("/v1/admin/login", { password });
      if (result.session) setSessionToken(result.session);
      navigate("/apps");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <motion.div {...pageTransition} className="min-h-[75vh] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-inkdim hover:text-ink transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            RETURN TO BASE
          </Link>
          <span className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim">REV F</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="nameplate p-6 sm:p-7"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 mb-6"
          >
            <Mark className="w-9 h-9" />
            <div>
              <div className="font-mono font-bold tracking-[0.22em]">
                RODEX<em className="text-gold not-italic">DB</em>
              </div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-inkdim mt-1">GATEWAY CONSOLE · REV F</div>
            </div>
          </motion.div>

          <FoldLink href={`${gatewayBase}/v1/auth/github/start`} variant="ghost" size="md" className="w-full">
            SIGN IN WITH GITHUB
          </FoldLink>
          <div className="my-4 flex items-center gap-3">
            <div className="foldline flex-1" />
            <span className="font-mono text-[9.5px] tracking-[0.22em] text-inkdim">— OR PASSWORD —</span>
            <div className="foldline flex-1" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ADMIN PASSWORD"
              autoComplete="current-password"
              className="w-full font-mono text-[13px] tracking-[0.1em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
            />
            <FoldButton size="md" className="w-full" disabled={busy || !password}>
              {busy ? "VERIFYING…" : "ENTER"}
            </FoldButton>
          </form>
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 font-mono text-[11px] tracking-[0.08em] text-redx"
            >
              {error}
            </motion.div>
          )}
        </motion.div>

        {/* spec strip */}
        <div className="mt-4 grid grid-cols-3 divide-x divide-line border border-line rounded-lg bg-panel/60">
          {SPEC.map((s) => (
            <div key={s.label} className="px-2.5 py-2.5 text-center">
              <s.icon className="w-3.5 h-3.5 mx-auto mb-1.5 text-inkdim" aria-hidden="true" />
              <div className="font-mono text-[8.5px] tracking-[0.16em] text-inkdim">{s.label}</div>
              <div className="font-mono text-[9px] tracking-[0.1em] text-ink mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-center font-mono text-[9px] tracking-[0.2em] text-inkdim/70">
          RESTRICTED CONSOLE — AUTHORIZED OPERATORS ONLY
        </div>
      </div>
    </motion.div>
  );
}
