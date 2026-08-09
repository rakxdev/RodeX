import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { pageTransition, fadeUp, stagger } from "@/lib/motion";

const cells = [
  {
    cell: "01",
    title: "ISOLATION",
    body: "Every app gets its own API key and its own prefixed tables. No cross-app access, no shared credentials, no surprises.",
  },
  {
    cell: "02",
    title: "FREE-TIER HONEST",
    body: "Provisioned DynamoDB under the always-free tier. Item-size caps and per-app budgets engineered so you never hit a throttle.",
  },
  {
    cell: "03",
    title: "IDEMPOTENT CONTRACT",
    body: "request_id replay protection, expected_version conflicts, soft-delete recovery window. The API behaves — or tells you why.",
  },
];

export default function LandingPage() {
  return (
    <motion.div {...pageTransition} className="min-h-screen flex flex-col">
      {/* top strip */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-4">
        <svg viewBox="0 0 64 64" className="w-7 h-7" role="img" aria-label="RodeX">
          <path d="M32 6 L56 22 L32 58 L8 22 Z" fill="none" stroke="#E8E4DA" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M32 10 L52 22 M32 10 L12 22 M32 54 L52 42 M32 54 L12 42" stroke="#8A9184" strokeWidth="1.3" />
          <path d="M20 18 L44 42 M46 18 L22 42" stroke="#E8E4DA" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M40 40 v9 M44 43 v5 M36 43 v5" stroke="#D9B64A" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="32" cy="32" r="2" fill="#E8452C" />
          <rect x="22" y="2" width="20" height="6" fill="#D9B64A" />
        </svg>
        <span className="font-mono font-bold tracking-[0.22em] text-sm">
          RODEX<em className="text-gold not-italic">DB</em>
        </span>
        <span className="ml-auto hidden sm:inline font-mono text-[10px] tracking-[0.18em] text-inkdim">
          GATEWAY CONSOLE · REV F
        </span>
        <Link
          to="/login"
          className="ml-auto sm:ml-4 font-mono text-[11px] tracking-[0.18em] px-3 py-1.5 rounded-md border border-line bg-panel2 text-ink hover:border-gold/60 hover:text-gold transition-colors"
        >
          ENTER CONSOLE
        </Link>
      </header>

      {/* hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16">
        <motion.svg
          viewBox="0 0 64 64"
          className="w-16 sm:w-20 h-16 sm:h-20 mb-6"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <path d="M32 6 L56 22 L32 58 L8 22 Z" fill="none" stroke="#E8E4DA" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M32 10 L52 22 M32 10 L12 22 M32 54 L52 42 M32 54 L12 42" stroke="#8A9184" strokeWidth="1.3" />
          <path d="M20 18 L44 42 M46 18 L22 42" stroke="#E8E4DA" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M40 40 v9 M44 43 v5 M36 43 v5" stroke="#D9B64A" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="32" cy="32" r="2" fill="#E8452C" />
          <rect x="22" y="2" width="20" height="6" fill="#D9B64A" />
        </motion.svg>

        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-mono text-2xl sm:text-4xl font-bold tracking-[0.18em]"
        >
          RODEX<em className="text-gold not-italic">DB</em>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.06 }}
          className="mt-3 font-mono text-[11px] sm:text-[12px] tracking-[0.28em] text-inkdim uppercase"
        >
          The database gateway — per-app keys, per-app tables
        </motion.p>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.12 }}
          className="mt-5 max-w-md font-mono text-[12px] sm:text-[13px] leading-relaxed text-ink/80"
        >
          One gateway. Per-app isolation. DynamoDB always-free tier.
          <br className="hidden sm:block" /> Never throttled by design.
        </motion.p>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.18 }}
          className="mt-8 flex flex-col sm:flex-row items-center gap-3"
        >
          <Link
            to="/login"
            className="inline-flex items-center gap-2 font-mono text-[12px] tracking-[0.18em] px-6 py-3 rounded-lg border border-gold/70 bg-gold/10 text-gold hover:bg-gold/20 transition-colors"
          >
            ENTER CONSOLE <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#spec"
            className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] px-5 py-3 rounded-lg text-inkdim hover:text-ink transition-colors"
          >
            SPEC SHEET <ChevronDown className="w-4 h-4" />
          </a>
        </motion.div>
      </section>

      {/* spec cells */}
      <section id="spec" className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <motion.div
          variants={stagger(0.07)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {cells.map((c) => (
            <motion.div key={c.cell} variants={fadeUp} className="sheet-panel p-5">
              <h4 className="mb-3">
                <b>CELL {c.cell}</b> · {c.title}
              </h4>
              <p className="font-mono text-[12px] leading-relaxed text-inkdim">{c.body}</p>
            </motion.div>
          ))}
        </motion.div>
        <div className="mt-10 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 font-mono text-[12px] tracking-[0.18em] px-6 py-3 rounded-lg border border-line bg-panel2 text-ink hover:border-gold/60 hover:text-gold transition-colors"
          >
            ENTER CONSOLE <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* footer strip */}
      <footer className="px-4 sm:px-6 py-4 border-t border-line flex flex-wrap gap-x-6 gap-y-1 justify-between font-mono text-[9.5px] sm:text-[10px] tracking-[0.16em] text-inkdim">
        <span>RODEX DB — GATEWAY CONSOLE</span>
        <span className="hidden md:inline">REV F · INSTRUMENT PACKET</span>
        <span>rodexdb.pages.dev</span>
      </footer>
    </motion.div>
  );
}
