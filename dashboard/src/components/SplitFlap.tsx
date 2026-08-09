import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * SplitFlap — Aceternity "text flipping board" (Vestaboard-style), tuned to
 * the Instrument-Packet world. Loops FOREVER: lands on the target, holds,
 * flips away and lands again — an endless wave.
 *
 * The flip starts when the board scrolls INTO the viewport. Respects
 * prefers-reduced-motion (static text).
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_$#@";

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function FlapChar({
  char,
  delay,
  duration,
  cycle,
}: {
  char: string;
  delay: number;
  duration: number;
  cycle: number; // 0 = static (not yet armed); >=1 = flip wave number
}) {
  const [display, setDisplay] = useState(char);
  const [live, setLive] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) setDisplay(char);
  }, [char]);

  useEffect(() => {
    if (cycle < 1 || reduced.current) return;
    const startAt = Date.now() + delay;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    setLive(true);
    const tick = () => {
      if (!alive) return;
      const elapsed = Date.now() - startAt;
      if (elapsed >= duration) {
        setDisplay(char);
        setLive(false);
        return;
      }
      setDisplay(randomGlyph());
      timer = setTimeout(tick, 30 + Math.random() * 36);
    };
    timer = setTimeout(tick, delay);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [cycle, char, delay, duration]);

  return (
    <span className="flap-cell" aria-hidden="true">
      <motion.span
        key={display}
        initial={live ? { rotateX: 90, opacity: 0.5 } : false}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{ duration: 0.13, ease: "easeOut" }}
        className={`flap-char ${live ? "" : "flap-char-landed"}`}
      >
        {display}
      </motion.span>
    </span>
  );
}

export default function SplitFlap({
  text,
  className = "",
  charDelay = 70,
  duration = 1100,
  delay = 0,
  holdMs = 2800,
}: {
  text: string;
  className?: string;
  /** ms between each character's flip start (wave) */
  charDelay?: number;
  /** per-character flip duration (ms) */
  duration?: number;
  /** extra wait before the first flip (ms) */
  delay?: number;
  /** how long the landed word stays before flipping away again */
  holdMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const [armed, setArmed] = useState(false);
  const [cycle, setCycle] = useState(0);

  // arm once visible, then flip after `delay`
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setArmed(true), delay);
    return () => clearTimeout(t);
  }, [inView, delay]);

  // endless loop: once armed, schedule the next flip wave after landing + hold
  useEffect(() => {
    if (!armed) return;
    const waveMs = duration + text.length * charDelay + holdMs;
    const t = setTimeout(() => setCycle((c) => c + 1), waveMs);
    return () => clearTimeout(t);
  }, [armed, cycle, duration, text.length, charDelay, holdMs]);

  return (
    <span ref={ref} className={`inline-flex gap-[3px] ${className}`} role="text" aria-label={text}>
      {text.split("").map((ch, i) =>
        ch === " " ? (
          <span key={i} className="w-[0.6em]" aria-hidden="true" />
        ) : (
          <FlapChar key={i} char={ch} delay={i * charDelay} duration={duration} cycle={armed ? cycle + 1 : 0} />
        ),
      )}
    </span>
  );
}