import { useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/api/client";
import KeyReveal from "@/components/KeyReveal";
import { istDate } from "@/lib/utils";

/**
 * Server-backed key reveal: the raw key is stored as a hash only, but stays
 * recoverable (AES-GCM) for a short window after creation/rotation. Inside the
 * window the console offers a gold "VIEW KEY" seal; after it, only rotation.
 */
export default function ViewKey({ appId, recoverableUntil }: { appId: string; recoverableUntil?: number }) {
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
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

  if (!inWindow) {
    return (
      <div className="font-mono text-[11px] tracking-[0.1em] text-inkdim">
        KEY RECOVERY EXPIRED — <span className="text-gold">ROTATE</span> TO ISSUE A NEW KEY
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim mb-2">
        RECOVERABLE UNTIL <span className="text-gold">{istDate(recoverableUntil)} IST</span>
      </div>
      {key ? (
        <KeyReveal apiKey={key} label="CURRENT API KEY" />
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
      {key && (
        <div className="mt-2 font-mono text-[9px] tracking-[0.12em] text-inkdim">
          REVEALED ONCE — RE-SEALED. USE <span className="text-gold">ROTATE KEY</span> FOR A FRESH KEY ANYTIME.
        </div>
      )}
    </div>
  );
}