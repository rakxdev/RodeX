import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { api, ApiError, type MeResult } from "@/api/client";
import { FoldButton } from "@/components/FoldButton";

/**
 * PROFILE dialog: shows the operator identity and lets the admin change the
 * password (old + new + confirm). The new password is hashed server-side and
 * stored in DynamoDB; the env password stays as the factory default.
 */
export default function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [me, setMe] = useState<MeResult | null>(null);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDone(false);
    setOldPw("");
    setNewPw("");
    setConfirmPw("");
    api.get<MeResult>("/v1/admin/me").then(setMe).catch(() => setMe(null));
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPw.length < 12) {
      setError("New password must be at least 12 characters");
      return;
    }
    if (newPw !== confirmPw) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/v1/admin/change-password", { old_password: oldPw, new_password: newPw });
      setDone(true);
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="nameplate w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Profile and password"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="font-mono text-[10px] tracking-[0.22em] text-gold">OPERATOR PROFILE</div>
              <button type="button" onClick={onClose} className="text-inkdim hover:text-ink" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* identity */}
            <div className="bg-panel2 border border-line rounded-lg px-3 py-2.5 mb-5 font-mono text-[11px]">
              <div className="flex justify-between"><span className="text-inkdim">IDENTITY</span><span className="text-ink">admin</span></div>
              <div className="flex justify-between mt-1"><span className="text-inkdim">GATEWAY</span><span className="text-inkdim">rodex-gateway.rakxdev.workers.dev</span></div>
              <div className="flex justify-between mt-1"><span className="text-inkdim">ALLOWED GITHUB</span><span className="text-ink">{(me?.allowed_users ?? []).join(" · ") || "—"}</span></div>
            </div>

            {done ? (
              <div className="py-4 text-center">
                <div className="font-mono text-[12px] tracking-[0.1em] text-ok mb-3">PASSWORD CHANGED</div>
                <div className="font-mono text-[10px] tracking-[0.1em] text-inkdim mb-4">
                  THE NEW PASSWORD IS ACTIVE NOW — USE IT NEXT TIME YOU LOG IN
                </div>
                <FoldButton variant="ghost" size="sm" onClick={onClose}>
                  CLOSE
                </FoldButton>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label htmlFor="old-pw" className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim block mb-1.5">
                    OLD PASSWORD
                  </label>
                  <input
                    id="old-pw"
                    name="old_password"
                    type="password"
                    value={oldPw}
                    onChange={(e) => setOldPw(e.target.value)}
                    autoComplete="current-password"
                    className="w-full font-mono text-[13px] tracking-[0.1em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label htmlFor="new-pw" className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim block mb-1.5">
                    NEW PASSWORD — MIN 12 CHARS
                  </label>
                  <input
                    id="new-pw"
                    name="new_password"
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    autoComplete="new-password"
                    className="w-full font-mono text-[13px] tracking-[0.1em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-pw" className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim block mb-1.5">
                    CONFIRM NEW PASSWORD
                  </label>
                  <input
                    id="confirm-pw"
                    name="confirm_password"
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    autoComplete="new-password"
                    className="w-full font-mono text-[13px] tracking-[0.1em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
                  />
                </div>
                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-mono text-[10.5px] tracking-[0.08em] text-redx">
                    {error}
                  </motion.div>
                )}
                <div className="flex gap-2 pt-2">
                  <FoldButton type="button" variant="ghost" size="sm" className="flex-1" onClick={onClose}>
                    CANCEL
                  </FoldButton>
                  <FoldButton size="sm" className="flex-1" disabled={busy || !oldPw || !newPw || !confirmPw}>
                    {busy ? "SAVING…" : "CHANGE PASSWORD"}
                  </FoldButton>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}