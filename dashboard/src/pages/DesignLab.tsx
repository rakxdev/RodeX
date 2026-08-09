import { motion } from "framer-motion";
import { ArrowRight, BookOpen } from "lucide-react";
import { pageTransition, fadeUp, stagger } from "@/lib/motion";
import { FoldButton, FoldLink } from "@/components/FoldButton";
import PublicShell from "@/components/PublicShell";
import { gatewayBase } from "@/api/client";

/**
 * DESIGN LAB — REV G proposals. Multiple visual directions on ONE page so the
 * direction can be chosen before it ships. Everything here is a static mock.
 */

function VariantFrame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="nameplate p-5">
      <div className="font-mono text-[9px] tracking-[0.22em] text-gold mb-4">{caption}</div>
      {children}
    </div>
  );
}

const terminal = `$ curl -X POST /v1/table/create
  -H "X-App-Id: app_7f2c…" \\
  -H "X-Api-Key: **********" \\
  -d '{"name":"users"}'
$ curl -X POST /v1/item/put
  -d '{"table":"users","item":{"pk":"USER#1"}}'
→ 200 ok:true version:1
$ curl -X POST /v1/query
  -d '{"table":"users","pk":"USER#1","limit":50}'
→ items:1 has_more:false`;

function HeroA() {
  // current direction: split hero, terminaal right
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <div>
        <div className="font-mono text-[9px] tracking-[0.24em] text-gold mb-3">CURRENT DIRECTION</div>
        <div className="font-mono text-xl font-bold tracking-[0.06em] leading-snug">
          THE DATABASE GATEWAY
          <br />
          <span className="text-inkdim font-semibold">FOR INDEPENDENT APPS</span>
        </div>
        <p className="font-mono text-[11.5px] text-ink/80 leading-relaxed mt-3 max-w-xs">
          One gateway, one documented API. Each app gets its own key and its own tables — never throttled by design.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <FoldButton size="sm">ENTER CONSOLE</FoldButton>
          <FoldButton variant="ghost" size="sm">VIEW DOCS</FoldButton>
        </div>
      </div>
      <div className="nameplate overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
          <span className="w-2 h-2 rounded-full dot-red" />
          <span className="w-2 h-2 rounded-full dot-amber" />
          <span className="w-2 h-2 rounded-full dot-ok" />
          <span className="ml-2 font-mono text-[8.5px] tracking-[0.2em] text-inkdim">RODEX GATEWAY — LIVE CONTRACT</span>
        </div>
        <pre className="p-3 font-mono text-[9.5px] leading-[1.7] overflow-x-auto no-scrollbar">{terminal}</pre>
      </div>
    </div>
  );
}

function HeroB() {
  // centered statement hero
  return (
    <div className="text-center py-4">
      <div className="font-mono text-[9px] tracking-[0.24em] text-gold mb-3">VARIANT B — CENTERED STATEMENT</div>
      <div className="font-mono text-2xl font-bold tracking-[0.08em]">ONE GATEWAY. PER-APP KEYS.</div>
      <div className="font-mono text-2xl font-bold tracking-[0.08em] text-gold mt-1">PER-APP TABLES.</div>
      <p className="font-mono text-[11.5px] text-ink/80 leading-relaxed mt-3 max-w-md mx-auto">
        The database gateway for independent apps — DynamoDB always-free tier, isolated per application,
        documented end to end.
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        <FoldButton size="sm">ENTER CONSOLE</FoldButton>
        <FoldButton variant="ghost" size="sm">VIEW DOCS</FoldButton>
      </div>
      <div className="flex justify-center gap-6 mt-5 font-mono text-[9px] tracking-[0.18em] text-inkdim">
        <span>25 GB FREE</span>
        <span>600 REQ/MIN · APP</span>
        <span>120 WRITES · 240 READS</span>
      </div>
    </div>
  );
}

function HeroC() {
  // full-width editorial hero with metric band
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.24em] text-gold mb-3">VARIANT C — EDITORIAL + METRIC BAND</div>
      <div className="flex flex-col md:flex-row gap-6 md:items-end">
        <div className="flex-1">
          <div className="font-mono text-[10px] tracking-[0.22em] text-inkdim mb-2">RODEXDB · GATEWAY PLATFORM</div>
          <div className="font-mono text-xl font-bold tracking-[0.05em] leading-snug">
            YOUR APPS SPEAK ONE API.
            <br />
            EACH ONE <span className="text-gold">OWNS ITS DATA.</span>
          </div>
        </div>
        <div className="flex-1 flex gap-2 justify-start md:justify-end">
          <FoldButton size="sm">ENTER CONSOLE</FoldButton>
          <FoldButton variant="ghost" size="sm">VIEW DOCS</FoldButton>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-5 text-center">
        {[
          ["25 GB", "FREE STORAGE"],
          ["600/min", "REQUESTS PER APP"],
          ["5 min", "DELETE RECOVERY WINDOW"],
        ].map(([v, k]) => (
          <div key={k} className="bg-panel2 border border-line rounded-lg py-3 px-2">
            <div className="font-mono text-[13px] font-bold text-ok">{v}</div>
            <div className="font-mono text-[7.5px] tracking-[0.18em] text-inkdim mt-1">{k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const palette: Array<[string, string, string]> = [
  ["PAPER", "#f2efe6", "text"],
  ["INK", "#e8e4da", "text"],
  ["INK-DIM", "#8a9184", "text"],
  ["PANEL", "#171a1f", "bg"],
  ["LINE", "#2a2f37", "border"],
  ["RED — ACTION", "#e8452c", "text"],
  ["AMBER — STATE", "#d9a441", "text"],
  ["GOLD — SEAL", "#d9b64a", "text"],
  ["OK", "#35d07f", "text"],
];

export default function DesignLab() {
  return (
    <motion.div {...pageTransition}>
      <PublicShell tag="DOCS">
        <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em] mb-2">
          DESIGN <span className="text-gold">LAB</span>
        </h1>
        <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mb-6">
          REV G PROPOSALS — PICK A DIRECTION, IT SHIPS · BASE <span className="text-gold">{gatewayBase}</span>
        </div>

        <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="flex flex-col gap-5">
          <VariantFrame caption="HOMEPAGE — HERO DIRECTIONS">
            <div className="flex flex-col gap-8">
              <HeroA />
              <div className="foldline" />
              <HeroB />
              <div className="foldline" />
              <HeroC />
            </div>
          </VariantFrame>

          <motion.div variants={fadeUp}>
            <VariantFrame caption="BUTTON SYSTEM — MIURA FOLD MATRIX">
              <div className="flex flex-wrap items-center gap-3">
                <FoldButton>PRIMARY</FoldButton>
                <FoldButton variant="ghost">GHOST</FoldButton>
                <FoldButton variant="gold">SEAL</FoldButton>
                <FoldButton variant="danger">DANGER</FoldButton>
                <FoldButton size="sm">SMALL</FoldButton>
                <FoldButton disabled>DISABLED</FoldButton>
                <FoldLink to="/design-lab" variant="red" size="sm">
                  LINK CTA <ArrowRight className="w-3.5 h-3.5" />
                </FoldLink>
                <FoldLink to="/design-lab" variant="ghost" size="sm">
                  <BookOpen className="w-3.5 h-3.5" /> DOCS LINK
                </FoldLink>
              </div>
            </VariantFrame>
          </motion.div>

          <motion.div variants={fadeUp}>
            <VariantFrame caption="COLOUR CONTRACT — TOKEN STRIP">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {palette.map(([name, hex, kind]) => (
                  <div key={name} className="bg-panel2 border border-line rounded-lg p-2.5">
                    <div
                      className={`h-8 rounded-md mb-2 ${kind === "text" ? "" : ""}`}
                      style={{
                        background: hex,
                        ...(kind === "text" ? { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)" } : {}),
                      }}
                    />
                    <div className="font-mono text-[8px] tracking-[0.14em] text-ink">{name}</div>
                    <div className="font-mono text-[8px] tracking-[0.1em] text-inkdim">{hex}</div>
                  </div>
                ))}
              </div>
            </VariantFrame>
          </motion.div>

          <motion.div variants={fadeUp}>
            <VariantFrame caption="CONSOLE — APP DETAIL HEAD (STICKY) PROPOSAL">
              <div className="bg-panel2 border border-line rounded-lg p-3">
                <div className="font-mono text-[9px] tracking-[0.14em] text-inkdim mb-1">← APP BOARD</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] tracking-[0.04em] text-ink">weather-bot</span>
                  <span className="stamp stamp-active">Active</span>
                  <span className="font-mono text-[9px] text-inkdim ml-auto">PURGE AT 19 AUG 2026, 21:30 IST</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <FoldButton variant="ghost" size="sm">SUSPEND</FoldButton>
                  <FoldButton variant="ghost" size="sm">ROTATE KEY</FoldButton>
                  <FoldButton variant="danger" size="sm">DELETE</FoldButton>
                </div>
              </div>
            </VariantFrame>
          </motion.div>
        </motion.div>
      </PublicShell>
    </motion.div>
  );
}