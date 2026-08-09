import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api, gatewayBase, ApiError } from "@/api/client";
import { Mark } from "@/App";
import { pageTransition } from "@/lib/motion";

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
      await api.post("/v1/admin/login", { password });
      navigate("/apps");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <motion.div {...pageTransition} className="min-h-[70vh] grid place-items-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="nameplate p-6 sm:p-8">
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

          <motion.a
            href={`${gatewayBase}/v1/auth/github/start`}
            whileTap={{ scale: 0.98 }}
            className="block text-center font-mono text-[12px] tracking-[0.14em] py-3 rounded-lg border border-line bg-panel2 hover:bg-panel text-ink transition-colors"
          >
            SIGN IN WITH GITHUB
          </motion.a>
          <div className="my-4 text-center font-mono text-[10px] tracking-[0.2em] text-inkdim">— OR PASSWORD —</div>

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
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={busy || !password}
              className="action-red w-full py-3 text-[12px] rounded-lg"
            >
              {busy ? "VERIFYING…" : "ENTER"}
            </motion.button>
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
        </div>
      </motion.div>
    </motion.div>
  );
}
