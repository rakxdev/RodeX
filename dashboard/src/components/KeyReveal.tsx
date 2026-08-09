import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";

/**
 * The signature ritual: a gold-foil seal that breaks once, revealing the key.
 * Used at app creation and key rotation — the key is shown exactly once.
 */
export default function KeyReveal({ apiKey, label = "API KEY" }: { apiKey: string; label?: string }) {
  const [broken, setBroken] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div>
      <div className="font-mono text-[9.5px] tracking-[0.22em] text-gold mb-2 uppercase">{label} — shown once</div>
      <AnimatePresence mode="wait" initial={false}>
        {!broken ? (
          <motion.button
            key="sealed"
            type="button"
            onClick={() => setBroken(true)}
            className="gold-seal w-full py-5 text-[11px] cursor-pointer text-center"
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
          >
            BREAK SEAL TO REVEAL
            <span className="block text-[9px] font-semibold opacity-75 mt-1 tracking-[0.2em]">{label} · ONE TIME</span>
          </motion.button>
        ) : (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative bg-panel2 border border-line rounded-lg p-4 overflow-hidden"
          >
            <div
              className="absolute inset-x-0 top-0 h-[22px] opacity-90"
              style={{
                background: "linear-gradient(140deg,#e3c96a,#b8952f)",
                clipPath:
                  "polygon(0 100%, 8% 0, 20% 100%, 34% 12%, 48% 100%, 62% 0, 76% 100%, 88% 10%, 100% 100%)",
              }}
            />
            <div className="flex items-center gap-2 mt-5 mb-1.5">
              <span className="font-mono text-[9px] tracking-[0.2em] text-gold">SEAL BROKEN · KEY REVEALED</span>
              <button
                type="button"
                onClick={copy}
                className="ml-auto flex items-center gap-1 font-mono text-[9.5px] tracking-[0.14em] text-inkdim hover:text-ink transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>
            <code className="block font-mono text-[12.5px] leading-relaxed break-all text-paper">{apiKey}</code>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
