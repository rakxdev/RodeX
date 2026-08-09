import { motion } from "framer-motion";
import { pageTransition, fadeUp, stagger } from "@/lib/motion";

export default function UsagePage() {
  const rows = [
    { k: "Item size", v: "≤ 20 KB per row (413 above) — keeps you never-throttled on the 25-WCU free budget" },
    { k: "Per app · total", v: "600 req/min (429 with retry_after)" },
    { k: "Per app · writes", v: "120 / min" },
    { k: "Per app · reads", v: "240 / min" },
    { k: "Platform pool", v: "1 000 req/min across apps (per Cloudflare location)" },
    { k: "Storage", v: "25 GB DynamoDB free tier · ap-southeast-1" },
    { k: "Daily workers", v: "100 000 requests/day (shared by gateway + dashboard)" },
  ];

  return (
    <motion.div {...pageTransition}>
      <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em] mb-2">
        USAGE & <span className="text-gold">LIMITS</span>
      </h1>
      <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mb-6">CAPACITY MATH · DOCS/RATE-LIMITS.MD · FREE-TIER HONEST</div>
      <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="sheet-panel divide-y divide-line">
        {rows.map((r) => (
          <motion.div key={r.k} variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 px-5 py-3.5">
            <div className="font-mono text-[12px] text-gold tracking-[0.08em] w-44 shrink-0">{r.k}</div>
            <div className="font-mono text-[12px] text-inkdim">{r.v}</div>
          </motion.div>
        ))}
      </motion.div>
      <p className="font-mono text-[10px] sm:text-[10.5px] tracking-[0.1em] text-inkdim mt-5">
        REAL-TIME PER-APP METERS SHIP WITH THE OBSERVABILITY PHASE — THE BUDGET TABLE ABOVE IS THE CONTRACT TODAY.
      </p>
    </motion.div>
  );
}
