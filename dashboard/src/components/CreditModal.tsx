import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import SplitFlap from "@/components/SplitFlap";
import { FoldButton } from "@/components/FoldButton";

const REPO = "https://github.com/rakxdev/RodeX";
const PROFILE = "https://github.com/rakxdev";

/**
 * CREDITS — the maker's section, available everywhere: landing (full section),
 * console header, and documentation header. Same content, same voice.
 */
export function CreditContent({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      {!compact && (
        <div className="mb-4">
          <SplitFlap text="RAKXDEV" className="text-2xl" />
        </div>
      )}
      <div className="font-mono text-[12px] sm:text-[13px] tracking-[0.08em] text-ink">
        RodeX DB — the database gateway for independent apps
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-inkdim mt-3 max-w-md">
        Built one project at a time by <span className="text-gold">RAKXDEV</span> — a personal gateway platform on
        DynamoDB's always-free tier, shipped through Cloudflare, designed in the Instrument-Packet language.
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-5">
        <FoldButton variant="ghost" size="sm" onClick={() => window.open(PROFILE, "_blank")}>
          GITHUB PROFILE
        </FoldButton>
        <FoldButton variant="ghost" size="sm" onClick={() => window.open(REPO, "_blank")}>
          SOURCE CODE
        </FoldButton>
      </div>
      <div className="font-mono text-[9px] tracking-[0.2em] text-inkdim mt-5">
        REV F · INSTRUMENT PACKET · rodexdb.pages.dev
      </div>
    </div>
  );
}

export default function CreditModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
            aria-label="Credits"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="font-mono text-[10px] tracking-[0.22em] text-gold">CREDITS</div>
              <button type="button" onClick={onClose} className="text-inkdim hover:text-ink" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <CreditContent />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}