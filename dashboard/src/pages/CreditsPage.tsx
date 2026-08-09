import { motion } from "framer-motion";
import { ArrowUpRight, Github, Layers, Server, Wrench } from "lucide-react";
import { pageTransition, fadeUp, stagger } from "@/lib/motion";
import PublicShell from "@/components/PublicShell";
import SplitFlap from "@/components/SplitFlap";
import TiltCard from "@/components/TiltCard";
import Magnetic from "@/components/Magnetic";
import { FoldButton, FoldLink } from "@/components/FoldButton";

const PROFILE = "https://github.com/rakxdev";
const REPO = "https://github.com/rakxdev/RodeX";

const MARQUEE = [
  "RODEX DB · INSTRUMENT PACKET",
  "FREE-TIER HONEST",
  "PER-APP ISOLATION",
  "IDEMPOTENT CONTRACT",
  "DYNAMODB · CLOUDFLARE · REACT",
  "NEVER THROTTLED BY DESIGN",
];

const cards = [
  {
    icon: Layers,
    title: "THE PRODUCT",
    body: "A database gateway for independent apps — per-app keys, per-app tables, one documented API. Designed to live comfortably inside the DynamoDB always-free tier.",
  },
  {
    icon: Wrench,
    title: "THE MAKER",
    body: "Built by RAKXDEV as a personal platform — everything from the gateway worker (Hono, TypeScript) to the console (React, Tailwind) and the Instrument-Packet design language.",
  },
  {
    icon: Server,
    title: "THE STACK",
    body: "Cloudflare Workers + Pages · DynamoDB ap-southeast-1 (free tier) · GitHub Actions CI/CD · HMAC + AES-GCM auth · 95+ tests, all green.",
  },
];

export default function CreditsPage() {
  return (
    <motion.div {...pageTransition}>
      <PublicShell tag="CREDITS">
        {/* hero */}
        <section className="relative text-center pt-10 sm:pt-16 pb-4">
          <div className="ambient" aria-hidden="true" />
          <div className="relative">
            <motion.div variants={fadeUp} initial="hidden" animate="show" className="font-mono text-[10px] tracking-[0.26em] text-inkdim mb-6">
              THE MAKER · THE PRODUCT · THE STACK
            </motion.div>
            <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.1 }} className="flex justify-center mb-8">
              <SplitFlap text="RAKXDEV" className="text-4xl sm:text-6xl" delay={500} />
            </motion.div>
            <motion.p variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.2 }} className="mx-auto max-w-xl font-mono text-[12.5px] sm:text-[14px] leading-relaxed text-ink/80">
              RodeX DB — a personal gateway platform built to full production grade,
              so it can serve as a reusable base for whatever comes next.
            </motion.p>
            <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.28 }} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Magnetic>
                <FoldButton size="lg" onClick={() => window.open(PROFILE, "_blank")}>
                  GITHUB PROFILE <ArrowUpRight className="w-4 h-4" />
                </FoldButton>
              </Magnetic>
              <Magnetic strength={0.2}>
                <FoldLink to="/docs" variant="ghost" size="lg">
                  THE API <ArrowUpRight className="w-4 h-4" />
                </FoldLink>
              </Magnetic>
            </motion.div>
          </div>
        </section>

        {/* rolling strip */}
        <div className="marquee my-10" aria-hidden="true">
          <div className="marquee-track">
            <span>
              {MARQUEE.map((m) => (
                <span key={m} className="mx-6">
                  <b>◆</b> {m}
                </span>
              ))}
            </span>
            <span>
              {MARQUEE.map((m) => (
                <span key={m} className="mx-6">
                  <b>◆</b> {m}
                </span>
              ))}
            </span>
          </div>
        </div>

        {/* cards */}
        <motion.div
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
        >
          {cards.map((c) => (
            <motion.div key={c.title} variants={fadeUp}>
              <TiltCard className="h-full">
                <div className="sheet-panel p-6 h-full">
                  <c.icon className="w-5 h-5 text-amberx mb-4" aria-hidden="true" />
                  <h3 className="font-mono text-[12px] tracking-[0.14em] mb-3">{c.title}</h3>
                  <p className="font-mono text-[11.5px] leading-relaxed text-inkdim">{c.body}</p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>

        {/* links band */}
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="nameplate p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6">
          <div className="text-center sm:text-left">
            <div className="font-mono text-[10px] tracking-[0.22em] text-gold mb-2">OPEN SOURCE</div>
            <div className="font-mono text-[12px] sm:text-[13px] tracking-[0.06em] text-ink">
              SOURCE, CONTRACT, AND THE FULL HISTORY — ON GITHUB
            </div>
          </div>
          <div className="ml-auto flex flex-wrap justify-center gap-2 shrink-0">
            <FoldButton size="sm" onClick={() => window.open(PROFILE, "_blank")}>
              PROFILE <Github className="w-3.5 h-3.5" />
            </FoldButton>
            <FoldButton variant="ghost" size="sm" onClick={() => window.open(REPO, "_blank")}>
              SOURCE CODE <ArrowUpRight className="w-3.5 h-3.5" />
            </FoldButton>
          </div>
        </motion.div>

        <div className="text-center font-mono text-[9.5px] tracking-[0.22em] text-inkdim pb-4">
          REV F · INSTRUMENT PACKET · rodexdb.pages.dev
        </div>
      </PublicShell>
    </motion.div>
  );
}