import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Shield, Coins, Repeat } from "lucide-react";
import { pageTransition, fadeUp, stagger } from "@/lib/motion";
import { FoldLink } from "@/components/FoldButton";

const GW_HEALTH = "https://rodex-gateway.rakxdev.workers.dev/v1/health";
const REPO = "https://github.com/rakxdev/RodeX";

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

function MarkSvg({ className = "w-7 h-7" }: { className?: string }) {
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

const features = [
  {
    icon: Shield,
    title: "PER-APP ISOLATION",
    body: "Each app gets its own key and its own prefixed tables — enforced at the storage layer, not by convention. No cross-app access, no shared credentials.",
  },
  {
    icon: Coins,
    title: "FREE-TIER HONEST",
    body: "Built on the DynamoDB always-free tier. Item caps and per-app budgets are engineered so your apps never hit a throttle — the limits are the contract.",
  },
  {
    icon: Repeat,
    title: "IDEMPOTENT CONTRACT",
    body: "request_id replay protection, expected_version conflict detection, soft-delete recovery window. The API behaves — or tells you why, with a code.",
  },
];

const steps = [
  { n: "01", title: "FABRICATE AN APP", body: "One click on the app board. You receive an API key — revealed exactly once, sealed in gold. Rotate anytime; the old key dies instantly." },
  { n: "02", title: "CREATE A TABLE", body: "app_<id>_<name> — owned by your app alone. No other app can read, write, or delete it." },
  { n: "03", title: "WRITE · READ · QUERY", body: "One documented contract: put, get, update, delete, query. Retries are safe, conflicts are loud, limits are honest." },
];

const budget = [
  { k: "ITEM SIZE", v: "≤ 20 KB" },
  { k: "PER APP · REQS", v: "600 / min" },
  { k: "PER APP · WRITES", v: "120 / min" },
  { k: "PER APP · READS", v: "240 / min" },
  { k: "PLATFORM POOL", v: "1 000 / min" },
  { k: "STORAGE", v: "25 GB FREE" },
];

export default function LandingPage() {
  return (
    <motion.div {...pageTransition} className="min-h-screen flex flex-col">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="max-w-6xl mx-auto w-full flex items-center gap-3 px-4 sm:px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <MarkSvg />
            <span className="font-mono font-bold tracking-[0.22em] text-sm">
              RODEX<em className="text-gold not-italic">DB</em>
            </span>
          </Link>
          <nav className="ml-auto hidden sm:flex items-center gap-5 font-mono text-[10.5px] tracking-[0.18em]">
            <a href="#features" className="text-inkdim hover:text-ink transition-colors">FEATURES</a>
            <a href="#how" className="text-inkdim hover:text-ink transition-colors">HOW IT WORKS</a>
            <a href="#contract" className="text-inkdim hover:text-ink transition-colors">THE CONTRACT</a>
            <Link to="/docs" className="text-inkdim hover:text-gold transition-colors">DOCS</Link>
          </nav>
          <FoldLink to="/login" variant="ghost" size="sm" className="ml-auto sm:ml-5">
            ENTER CONSOLE
          </FoldLink>
        </div>
      </header>

      {/* hero */}
      <section className="max-w-4xl mx-auto w-full text-center px-4 pt-16 sm:pt-24 pb-14 sm:pb-20">
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex justify-center mb-6">
          <MarkSvg className="w-12 h-12 sm:w-14 sm:h-14" />
        </motion.div>
        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-mono text-2xl sm:text-4xl font-bold tracking-[0.06em] leading-snug"
        >
          THE DATABASE GATEWAY
          <br className="hidden sm:block" />
          <span className="text-inkdim font-semibold">FOR INDEPENDENT APPS</span>
        </motion.h1>
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.06 }}
          className="mt-5 max-w-2xl mx-auto font-mono text-[12.5px] sm:text-[14px] leading-relaxed text-ink/80"
        >
          One gateway, one documented API. Each of your bots and websites gets its own key and its own tables —
          on DynamoDB's always-free tier, never throttled by design.
        </motion.p>
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.1 }} className="mt-6">
          <GatewayStatus />
        </motion.div>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.14 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <FoldLink to="/login" variant="red" size="lg" className="w-full sm:w-auto">
            ENTER CONSOLE <ArrowRight className="w-4 h-4" />
          </FoldLink>
          <FoldLink to="/docs" variant="ghost" size="lg" className="w-full sm:w-auto">
            VIEW DOCS <BookOpen className="w-4 h-4" />
          </FoldLink>
        </motion.div>
      </section>

      {/* features */}
      <section id="features" className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-14 scroll-mt-20">
        <div className="flex items-baseline gap-3 mb-5">
          <h2 className="font-mono text-sm sm:text-base tracking-[0.14em]">
            WHY <span className="text-gold">RODEXDB</span>
          </h2>
        </div>
        <motion.div variants={stagger(0.07)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <motion.div key={f.title} variants={fadeUp} className="sheet-panel p-5">
              <f.icon className="w-5 h-5 text-amberx mb-3" aria-hidden="true" />
              <h3 className="font-mono text-[12px] tracking-[0.12em] mb-2">{f.title}</h3>
              <p className="font-mono text-[12px] leading-relaxed text-inkdim">{f.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* how it works */}
      <section id="how" className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-14 scroll-mt-20">
        <div className="flex items-baseline gap-3 mb-5">
          <h2 className="font-mono text-sm sm:text-base tracking-[0.14em]">
            HOW IT <span className="text-gold">WORKS</span>
          </h2>
        </div>
        <motion.div variants={stagger(0.07)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((s) => (
            <motion.div key={s.n} variants={fadeUp} className="sheet-panel p-5">
              <div className="font-mono text-[10px] tracking-[0.2em] text-gold mb-3">{s.n}</div>
              <h3 className="font-mono text-[12px] tracking-[0.12em] mb-2">{s.title}</h3>
              <p className="font-mono text-[12px] leading-relaxed text-inkdim">{s.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* contract */}
      <section id="contract" className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-14 scroll-mt-20">
        <div className="flex items-baseline gap-3 mb-5">
          <h2 className="font-mono text-sm sm:text-base tracking-[0.14em]">
            THE <span className="text-gold">CONTRACT</span>
          </h2>
          <span className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim">FREE-TIER HONEST — NEVER THROTTLED BY DESIGN</span>
        </div>
        <motion.div variants={stagger(0.05)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="sheet-panel divide-y divide-line">
          {budget.map((b) => (
            <motion.div key={b.k} variants={fadeUp} className="flex items-center justify-between px-5 py-3">
              <span className="font-mono text-[11px] tracking-[0.14em] text-inkdim">{b.k}</span>
              <span className="font-mono text-[13px] tracking-[0.06em] text-ok">{b.v}</span>
            </motion.div>
          ))}
        </motion.div>
        <div className="mt-6 text-center">
          <FoldLink to="/docs" variant="ghost" size="md">
            VIEW DOCS <BookOpen className="w-4 h-4" />
          </FoldLink>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-5 flex flex-wrap gap-x-6 gap-y-2 justify-between items-center font-mono text-[9.5px] sm:text-[10px] tracking-[0.16em] text-inkdim">
          <span>RODEX DB — GATEWAY CONSOLE · REV F</span>
          <span className="hidden md:inline">INSTRUMENT PACKET</span>
          <span className="flex items-center gap-2">
            BUILT BY <a href={REPO} target="_blank" rel="noreferrer" className="text-gold hover:underline">RAKXDEV</a>
            <span className="text-inkdim/60">·</span>
            <a href={REPO} target="_blank" rel="noreferrer" className="text-inkdim hover:text-gold transition-colors">GITHUB</a>
          </span>
        </div>
      </footer>
    </motion.div>
  );
}