import { motion } from "framer-motion";
import { pageTransition, fadeUp, stagger, foldIn } from "@/lib/motion";

const writes = [
  { k: "writes / min", v: "120", note: "per app — put / update / delete" },
  { k: "reads / min", v: "240", note: "per app — get / query (strong reads cost 2×)" },
];

const reads = [
  { k: "total / min", v: "600", note: "per app — writes + reads combined" },
  { k: "platform pool", v: "1 000", note: "across all apps, per Cloudflare location" },
  { k: "admin surface", v: "60", note: "dashboard + API management" },
];

const storage = [
  { k: "item size", v: "≤ 20 KB", note: "413 above the cap — keeps the 25-WCU budget safe" },
  { k: "storage", v: "25 GB", note: "DynamoDB always-free tier · ap-southeast-1" },
  { k: "daily workers", v: "100 000", note: "requests/day, shared by gateway + dashboard" },
];

const groups = [
  { title: "WRITE BUDGET", rows: writes },
  { title: "READ & PLATFORM", rows: reads },
  { title: "STORAGE & CAPS", rows: storage },
];

export default function UsagePage() {
  return (
    <motion.div {...pageTransition}>
      <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em] mb-2">
        USAGE & <span className="text-gold">LIMITS</span>
      </h1>
      <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mb-6">
        CAPACITY MATH · FREE-TIER HONEST · THE BUDGET IS THE CONTRACT
      </div>

      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {groups.map((g) => (
          <motion.div key={g.title} variants={foldIn} className="sheet-panel p-5">
            <h4 className="mb-4">
              <b>{g.title}</b>
            </h4>
            <dl className="space-y-0 divide-y divide-line/70">
              {g.rows.map((r) => (
                <div key={r.k} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="font-mono text-[10.5px] tracking-[0.12em] text-inkdim">{r.k}</dt>
                    <dd className="font-mono text-[15px] tracking-[0.04em] text-gold">{r.v}</dd>
                  </div>
                  <div className="font-mono text-[10px] leading-relaxed text-inkdim mt-1">{r.note}</div>
                </div>
              ))}
            </dl>
          </motion.div>
        ))}
      </motion.div>

      {/* budget math */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="sheet-panel p-5 mt-4">
        <h4 className="mb-3">
          <b>WHY IT NEVER THROTTLES</b> — THE MATH
        </h4>
        <p className="font-mono text-[12px] leading-relaxed text-inkdim">
          The free tier grants 25 write units and 25 read units per second. A 20 KB item costs roughly 5 write units
          at 4 KB per unit — so the 120 writes/min budget (~2/s) stays four times under the WU ceiling, and 240
          reads/min (~4/s, or 2 strong reads) sits comfortably inside the RU budget. Even at the caps, the gateway
          never asks DynamoDB for more than the free tier gives.
        </p>
      </motion.div>

      <p className="font-mono text-[10px] sm:text-[10.5px] tracking-[0.1em] text-inkdim mt-5">
        REAL-TIME PER-APP METERS SHIP WITH THE OBSERVABILITY PHASE — THE BUDGET TABLE ABOVE IS THE CONTRACT TODAY.
      </p>
    </motion.div>
  );
}