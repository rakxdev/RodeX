import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen } from "lucide-react";
import { pageTransition, fadeUp, stagger } from "@/lib/motion";
import { FoldLink } from "@/components/FoldButton";

const GW_HEALTH = "https://rodex-gateway.rakxdev.workers.dev/v1/health";

function GatewayStatus() {
  const [state, setState] = useState<"checking" | "nominal" | "offline">("checking");
  useEffect(() => {
    let alive = true;
    fetch(GW_HEALTH)
      .then((r) => r.json())
      .then((b) => alive && setState(b?.ok ? "nominal" : "offline"))
      .catch(() => alive && setState("offline"));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[9.5px] tracking-[0.2em] text-inkdim">
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          state === "nominal" ? "bg-ok" : state === "offline" ? "bg-redx" : "bg-inkdim animate-pulse"
        }`}
        aria-hidden="true"
      />
      {state === "nominal" ? "GATEWAY NOMINAL" : state === "offline" ? "GATEWAY OFFLINE" : "LINK TEST…"}
    </span>
  );
}

const principles = [
  {
    cell: "01",
    title: "ISOLATION",
    body: "Every app gets its own API key and its own prefixed tables — enforced at the storage layer, not by convention. No cross-app access, no shared credentials.",
  },
  {
    cell: "02",
    title: "FREE-TIER HONEST",
    body: "Provisioned DynamoDB under the always-free tier. Item caps and per-app budgets engineered so your apps never hit a throttle.",
  },
  {
    cell: "03",
    title: "IDEMPOTENT CONTRACT",
    body: "request_id replay protection, expected_version conflicts, soft-delete recovery. The API behaves — or tells you why, with a code.",
  },
];

const steps = [
  {
    n: "1",
    title: "FABRICATE AN APP",
    body: "One click on the app board. You get an API key — revealed exactly once, sealed in gold. Rotate it anytime; the old key dies instantly.",
  },
  {
    n: "2",
    title: "CREATE A TABLE",
    body: "app_<id>_<name>. Your app owns it. No other app can read, write, or delete it. Period.",
  },
  {
    n: "3",
    title: "WRITE. READ. QUERY.",
    body: "One documented contract: put, get, update, delete, query. Retries are safe, conflicts are loud, limits are honest.",
  },
];

const budget = [
  { k: "ITEM SIZE", v: "≤ 20 KB" },
  { k: "PER APP · REQS", v: "600 / min" },
  { k: "PER APP · WRITES", v: "120 / min" },
  { k: "PER APP · READS", v: "240 / min" },
  { k: "PLATFORM POOL", v: "1 000 / min" },
  { k: "STORAGE", v: "25 GB FREE" },
];

function MarkBig({ className = "w-14 h-14" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="RodeX">
      <path d="M32 6 L56 22 L32 58 L8 22 Z" fill="none" stroke="#E8E4DA" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 10 L52 22 M32 10 L12 22 M32 54 L52 42 M32 54 L12 42" stroke="#8A9184" strokeWidth="1.3" />
      <path d="M20 18 L44 42 M46 18 L22 42" stroke="#E8E4DA" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M40 40 v9 M44 43 v5 M36 43 v5" stroke="#D9B64A" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32" cy="32" r="2" fill="#E8452C" />
      <rect x="22" y="2" width="20" height="6" fill="#D9B64A" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <motion.div {...pageTransition} className="min-h-screen flex flex-col">
      {/* top strip */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-4 max-w-6xl w-full mx-auto">
        <MarkBig className="w-7 h-7" />
        <span className="font-mono font-bold tracking-[0.22em] text-sm">
          RODEX<em className="text-gold not-italic">DB</em>
        </span>
        <nav className="ml-auto flex items-center gap-5">
          <a href="#platform" className="hidden sm:inline font-mono text-[10.5px] tracking-[0.18em] text-inkdim hover:text-ink transition-colors">
            PLATFORM
          </a>
          <a href="#how" className="hidden sm:inline font-mono text-[10.5px] tracking-[0.18em] text-inkdim hover:text-ink transition-colors">
            HOW IT WORKS
          </a>
          <Link to="/docs" className="font-mono text-[10.5px] tracking-[0.18em] text-inkdim hover:text-gold transition-colors">
            DOCS
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-14 sm:py-20">
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="mb-7">
          <MarkBig className="w-16 sm:w-20 h-16 sm:h-20" />
        </motion.div>

        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-mono text-3xl sm:text-5xl font-bold tracking-[0.16em]"
        >
          RODEX<em className="text-gold not-italic">DB</em>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.06 }}
          className="mt-4 font-mono text-[11px] sm:text-[12px] tracking-[0.28em] text-inkdim uppercase"
        >
          The database gateway — per-app keys, per-app tables
        </motion.p>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.12 }}
          className="mt-5 max-w-xl font-mono text-[12.5px] sm:text-[14px] leading-relaxed text-ink/80"
        >
          One gateway, one documented API. Your bots and websites each get their own key, their own tables —
          on DynamoDB's always-free tier, never throttled by design.
        </motion.p>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.16 }}
          className="mt-5"
        >
          <GatewayStatus />
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.18 }}
          className="mt-8 flex flex-col sm:flex-row items-center gap-3"
        >
          <FoldLink to="/login" variant="red" size="lg">
            ENTER CONSOLE <ArrowRight className="w-4 h-4" />
          </FoldLink>
          <FoldLink to="/docs" variant="ghost" size="lg">
            READ THE DOCS <BookOpen className="w-4 h-4" />
          </FoldLink>
        </motion.div>
      </section>

      {/* platform principles */}
      <section id="platform" className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-14 scroll-mt-20">
        <div className="flex items-baseline gap-3 mb-5">
          <h2 className="font-mono text-sm sm:text-base tracking-[0.14em]">
            THE <span className="text-gold">PLATFORM</span>
          </h2>
          <span className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim">THREE COMMITMENTS</span>
        </div>
        <motion.div
          variants={stagger(0.07)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {principles.map((c) => (
            <motion.div key={c.cell} variants={fadeUp} className="sheet-panel p-5">
              <h4 className="mb-3">
                <b>CELL {c.cell}</b> · {c.title}
              </h4>
              <p className="font-mono text-[12px] leading-relaxed text-inkdim">{c.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* how it works */}
      <section id="how" className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-14 scroll-mt-20">
        <div className="flex items-baseline gap-3 mb-5">
          <h2 className="font-mono text-sm sm:text-base tracking-[0.14em]">
            HOW IT <span className="text-gold">WORKS</span>
          </h2>
          <span className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim">THREE STEPS TO A LIVE DATABASE</span>
        </div>
        <motion.div
          variants={stagger(0.07)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {steps.map((s) => (
            <motion.div key={s.n} variants={fadeUp} className="sheet-panel p-5">
              <div className="font-mono text-lg text-gold mb-2">{s.n}</div>
              <h4 className="mb-2">
                <b>{s.title}</b>
              </h4>
              <p className="font-mono text-[12px] leading-relaxed text-inkdim">{s.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* the contract */}
      <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-14">
        <div className="flex items-baseline gap-3 mb-5">
          <h2 className="font-mono text-sm sm:text-base tracking-[0.14em]">
            THE <span className="text-gold">CONTRACT</span>
          </h2>
          <span className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim">FREE-TIER HONEST · NEVER THROTTLED BY DESIGN</span>
        </div>
        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="sheet-panel divide-y divide-line"
        >
          {budget.map((b) => (
            <motion.div key={b.k} variants={fadeUp} className="flex items-center justify-between px-5 py-3">
              <span className="font-mono text-[11px] tracking-[0.14em] text-inkdim">{b.k}</span>
              <span className="font-mono text-[13px] tracking-[0.06em] text-ok">{b.v}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* docs callout */}
      <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="nameplate p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-4 sm:gap-6"
        >
          <div className="text-center sm:text-left">
            <div className="font-mono text-[10px] tracking-[0.22em] text-gold mb-2">FULL API REFERENCE</div>
            <div className="font-mono text-[13px] sm:text-[14px] tracking-[0.06em] text-ink">
              AUTHENTICATION · TABLES · ITEMS · QUERY · LIMITS · ERRORS
            </div>
          </div>
          <FoldLink to="/docs" variant="ghost" size="md" className="ml-auto shrink-0">
            READ THE DOCS <BookOpen className="w-4 h-4" />
          </FoldLink>
        </motion.div>
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