import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * SplitFlap — faithful adaptation of Aceternity's TextFlippingBoard
 * (Vestaboard-style), tuned to the Instrument-Packet world.
 *
 * Mechanics (mirroring the reference implementation):
 *  - fixed board grid sized to the longest message
 *  - on message change every cell scrambles through random glyphs (55 ms
 *    steps, 25–40 per letter) then lands
 *  - a wave sweeps left→right, top→down (30 ms/col, 20 ms/row)
 *  - every glyph change is a REAL split-flap: the old top half drops away
 *    while the new bottom half rises in, across a split line
 *  - messages cycle forever (6 s hold, like the Aceternity demo)
 *
 * Respects prefers-reduced-motion (static board).
 */
const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+&=;:'\",%.?/";

const BASE_COL_DELAY = 30;
const BASE_ROW_DELAY = 20;
const BASE_STEP_MS = 55;
const BASE_FLIP_S = 0.35;
const BASE_TOTAL_S = ((22 - 1) * BASE_COL_DELAY + (6 - 1) * BASE_ROW_DELAY + 8 * BASE_STEP_MS) / 1000;

function randGlyph(): string {
  return FLAP_CHARS[1 + Math.floor(Math.random() * (FLAP_CHARS.length - 1))];
}

function FlapCell({
  target,
  delayMs,
  stepMs,
  flipDur,
  live,
}: {
  target: string;
  delayMs: number;
  stepMs: number;
  flipDur: number;
  live: boolean;
}) {
  const [current, setCurrent] = useState(" ");
  const [prev, setPrev] = useState(" ");
  const [flipId, setFlipId] = useState(0);
  const curRef = useRef(" ");
  const tgtRef = useRef<string | null>(null);
  const startTimer = useRef<number | null>(null);
  const stepTimer = useRef<number | null>(null);

  useEffect(() => {
    const st0 = startTimer.current;
    if (st0) clearTimeout(st0);
    const sp0 = stepTimer.current;
    if (sp0) clearTimeout(sp0);
    startTimer.current = null;
    stepTimer.current = null;

    const normalized = target === " " ? " " : target.toUpperCase();
    if (normalized === tgtRef.current) return;
    tgtRef.current = normalized;
    if (normalized === " " && curRef.current === " ") return;

    const scrambleCount = normalized === " " ? 8 + Math.floor(Math.random() * 8) : 25 + Math.floor(Math.random() * 15);

    const runStep = (i: number) => {
      const isLast = i === scrambleCount;
      const ch = isLast ? normalized : randGlyph();
      setPrev(curRef.current);
      curRef.current = ch;
      setCurrent(ch);
      setFlipId((n) => n + 1);
      if (!isLast) {
        stepTimer.current = window.setTimeout(() => runStep(i + 1), stepMs);
      }
    };

    startTimer.current = window.setTimeout(() => runStep(1), delayMs);

    return () => {
      const st2 = startTimer.current;
      if (st2) clearTimeout(st2);
      const sp2 = stepTimer.current;
      if (sp2) clearTimeout(sp2);
      startTimer.current = null;
      stepTimer.current = null;
      tgtRef.current = null;
    };
  }, [target, delayMs, stepMs]);

  if (!live) {
    // reduced motion: static board
    return (
      <span className="fb-cell">
        <span className="fb-half fb-top"><span className="fb-glyph">{target === " " ? "\u00A0" : target}</span></span>
        <span className="fb-half fb-bot"><span className="fb-glyph">{target === " " ? "\u00A0" : target}</span></span>
        <span className="fb-line" />
      </span>
    );
  }

  const show = current === " " ? "\u00A0" : current;
  const showPrev = prev === " " ? "\u00A0" : prev;

  return (
    <span className="fb-cell">
      {/* static halves — new character */}
      <span className="fb-half fb-top"><span className="fb-glyph">{show}</span></span>
      <span className="fb-half fb-bot"><span className="fb-glyph">{show}</span></span>

      {/* old top half drops away */}
      {flipId > 0 && (
        <motion.span
          key={`t${flipId}`}
          initial={{ rotateX: 0 }}
          animate={{ rotateX: -90 }}
          transition={{ duration: flipDur * 0.5, ease: "easeIn" }}
          className="fb-flap fb-topflap"
        >
          <span className="fb-glyph">{showPrev}</span>
        </motion.span>
      )}

      {/* new bottom half rises in */}
      {flipId > 0 && (
        <motion.span
          key={`b${flipId}`}
          initial={{ rotateX: 90 }}
          animate={{ rotateX: 0 }}
          transition={{ duration: flipDur * 0.5, ease: "easeOut" }}
          className="fb-flap fb-botflap"
        >
          <span className="fb-glyph">{show}</span>
        </motion.span>
      )}

      <span className="fb-line" />
    </span>
  );
}

export default function SplitFlap({
  messages,
  className = "",
  duration = 1.2,
  intervalMs = 6000,
  delay = 0,
}: {
  /** messages cycle forever on the board; "\n" creates rows */
  messages: string[];
  /** total flip-wave duration in seconds (Aceternity default ~1.2) */
  duration?: number;
  /** how long each message stays before the board flips to the next */
  intervalMs?: number;
  /** extra wait before the first flip (ms) — lets parent entrances settle */
  delay?: number;
  className?: string;
}) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [armed, setArmed] = useState(false);
  const [live, setLive] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // arm when visible (once) + respect reduced motion
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setLive(false);
      setArmed(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // endless cycle, exactly like the Aceternity demo (setInterval)
  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % messages.length), intervalMs);
    return () => clearInterval(id);
  }, [armed, messages.length, intervalMs]);

  // the board grid is fixed to the longest message so the frame never jumps
  const { rows, cols } = useMemo(() => {
    const lines = messages.map((m) => m.split("\n").map((l) => l.trim() || " "));
    const rows = Math.max(...lines.map((l) => l.length));
    const cols = Math.max(...lines.flat().map((l) => l.length));
    return { rows, cols };
  }, [messages]);

  const scale = duration / BASE_TOTAL_S;
  const colDelay = BASE_COL_DELAY * scale;
  const rowDelay = BASE_ROW_DELAY * scale;
  const stepMs = BASE_STEP_MS * scale;
  const flipDur = Math.min(0.6, Math.max(0.15, BASE_FLIP_S * scale));

  const currentLines = messages[msgIdx].split("\n").map((l) => l.trim() || " ");

  return (
    <div ref={rootRef} className={`fb-board ${className}`} role="text" aria-label={messages[msgIdx]}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="fb-row">
          {Array.from({ length: cols }, (_, c) => {
            const line = currentLines[r] ?? "";
            const char = c < line.length ? line[c] : " ";
            return (
              <FlapCell
                key={c}
                target={char}
                delayMs={delay + c * colDelay + r * rowDelay}
                stepMs={stepMs}
                flipDur={flipDur}
                live={live && armed}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}