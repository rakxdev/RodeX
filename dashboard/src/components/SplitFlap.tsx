import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * SplitFlap — Aceternity TextFlippingBoard mechanics (scramble + split-flap),
 * Instrument-Packet look. Robust build:
 *  - the board AUTO-SIZES to the current message — no blank cells ever
 *  - animation starts on mount (+delay), no observer gating
 *  - slower wave (60ms/col, 40ms/row), 90ms scramble steps, 0.5s flips
 *  - messages cycle forever (4.5s); a shimmer sweep runs while landed
 *  - reduced-motion renders a static board
 */
const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+&=;:'\",%.?/";

function randGlyph(): string {
  return FLAP_CHARS[1 + Math.floor(Math.random() * (FLAP_CHARS.length - 1))];
}

function FlapCell({
  target,
  delayMs,
  stepMs,
  flipDur,
  animate,
}: {
  target: string;
  delayMs: number;
  stepMs: number;
  flipDur: number;
  animate: boolean;
}) {
  const [current, setCurrent] = useState(target === " " ? " " : target.toUpperCase());
  const [prev, setPrev] = useState(" ");
  const [flipId, setFlipId] = useState(0);
  const curRef = useRef(current);
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

    // wait for the live flag — otherwise the scramble would run while the
    // static path is rendered and the flip would be invisible
    if (!animate) {
      tgtRef.current = null;
      return;
    }

    const normalized = target === " " ? " " : target.toUpperCase();
    if (normalized === tgtRef.current) return;
    tgtRef.current = normalized;
    if (normalized === " " && curRef.current === " ") return;

    const scrambleCount = normalized === " " ? 6 + Math.floor(Math.random() * 6) : 18 + Math.floor(Math.random() * 12);

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
    };
  }, [target, delayMs, stepMs, animate]);

  if (!animate) {
    return (
      <span className="fb-cell">
        <span className="fb-half fb-top"><span className="fb-glyph">{target === " " ? "\u00A0" : target.toUpperCase()}</span></span>
        <span className="fb-half fb-bot"><span className="fb-glyph">{target === " " ? "\u00A0" : target.toUpperCase()}</span></span>
        <span className="fb-line" />
      </span>
    );
  }

  const show = current === " " ? "\u00A0" : current;
  const showPrev = prev === " " ? "\u00A0" : prev;

  return (
    <span className="fb-cell">
      <span className="fb-half fb-top"><span className="fb-glyph">{show}</span></span>
      <span className="fb-half fb-bot"><span className="fb-glyph">{show}</span></span>

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
  duration = 2.0,
  intervalMs = 4500,
  delay = 0,
}: {
  messages: string[];
  duration?: number;
  intervalMs?: number;
  delay?: number;
  className?: string;
}) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setAnimate(false);
    const t = window.setTimeout(() => setArmed(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  // endless message cycle
  useEffect(() => {
    if (!armed) return;
    const id = window.setInterval(() => setMsgIdx((i) => (i + 1) % messages.length), intervalMs);
    return () => clearInterval(id);
  }, [armed, messages.length, intervalMs]);

  // auto-size to the CURRENT message — no blank cells, ever
  const currentLines = useMemo(
    () => messages[msgIdx].split("\n").map((l) => l.trim() || " "),
    [messages, msgIdx],
  );
  const rows = currentLines.length;
  const cols = Math.max(...currentLines.map((l) => l.length));

  const scale = duration / 2.0;
  const colDelay = 60 * scale;
  const rowDelay = 40 * scale;
  const stepMs = 90 * scale;
  const flipDur = Math.min(0.7, Math.max(0.2, 0.5 * scale));

  const running = animate && armed;

  return (
    <div className={`fb-board ${className}`} role="text" aria-label={messages[msgIdx]}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="fb-row">
          {Array.from({ length: cols }, (_, c) => {
            const line = currentLines[r] ?? "";
            const char = c < line.length ? line[c] : " ";
            return (
              <FlapCell
                key={c}
                target={char}
                delayMs={c * colDelay + r * rowDelay}
                stepMs={stepMs}
                flipDur={flipDur}
                animate={running}
              />
            );
          })}
        </div>
      ))}
      {running && <span className="fb-shimmer" aria-hidden="true" />}
    </div>
  );
}