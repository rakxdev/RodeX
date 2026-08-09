import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, EyeOff } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { istDate } from "@/lib/utils";

/**
 * Server-backed key reveal: the raw key is stored as a hash only, but stays
 * recoverable (AES-GCM) for a short window after creation/rotation. Inside the
 * window the console offers a SINGLE gold seal; clicking it decrypts and shows
 * the key directly (no double-seal), with copy + hide/re-seal buttons.
 */
export default function ViewKey({ appId, recoverableUntil }: { appId: string; recoverableUntil?: number }) {
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inWindow = !!recoverableUntil && recoverableUntil > Math.floor(Date.now() / 1000);

  async function reveal() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ api_key: string }>(`/v1/admin/apps/${appId}/view-key`, {});
      setKey(r.api_key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Key recovery failed");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (!inWindow) {
    return (
      <div className="font-mono text-[11px] tracking-[0.08em] text-inkdim leading-relaxed">
        KEY RECOVERY EXPIRED — 48 H WINDOW PASSED, ONLY THE HASH REMAINS.
        <br />
        <span className="text-gold">ROTATE</span> FOR A FRESH KEY · THE OLD KEY DIES ON ROTATE.
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim mb-2">
        RECOVERABLE UNTIL <span className="text-gold">{istDate(recoverableUntil)} IST</span>
      </div>
      {key ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="bg-panel2 border border-line rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[9px] tracking-[0.2em] text-gold">CURRENT API KEY</span>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 font-mono text-[9.5px] tracking-[0.14em] text-inkdim hover:text-ink transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
                {copied ? "COPIED" : "COPY"}
              </button>
              <button
                type="button"
                onClick={() => setKey(null)}
                className="inline-flex items-center gap-1 font-mono text-[9.5px] tracking-[0.14em] text-inkdim hover:text-ink transition-colors"
                aria-label="Hide key and re-seal"
              >
                <EyeOff className="w-3 h-3" /> HIDE
              </button>
            </span>
          </div>
          <code className="block font-mono text-[12.5px] leading-relaxed break-all text-paper">{key}</code>
        </motion.div>
      ) : (
        <motion.button
          type="button"
          onClick={reveal}
          disabled={busy}
          className="gold-seal w-full py-5 text-[11px] cursor-pointer text-center disabled:opacity-50"
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.97 }}
        >
          {busy ? "UNSEALING…" : "VIEW KEY"}
          <span className="block text-[9px] font-semibold opacity-75 mt-1 tracking-[0.2em]">
            ENCRYPTED AT REST · DECRYPTED ON DEMAND
          </span>
        </motion.button>
      )}
      {error && <div className="mt-2 font-mono text-[10px] tracking-[0.08em] text-redx">{error}</div>}
    </div>
  );
}