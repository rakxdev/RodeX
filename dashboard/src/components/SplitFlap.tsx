import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * SplitFlap — Aceternity "text flipping board" (Vestaboard-style), tuned to
 * the Instrument-Packet world. Each character cycles through random glyphs in
 * a flip cell, then lands on its target.
 *
 * The flip starts when the board scrolls INTO the viewport (once) — this also
 * guarantees the animation is visible: it never runs while the parent is still
 * fading in. Respects prefers-reduced-motion.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_$#@";

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function FlapChar({ char, delay, duration, start }: { char: string; delay: number; duration: number; start: boolean }) {
  const [display, setDisplay] = useState(char);
  const [live, setLive] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) setDisplay(char);
  }, [char]);

  useEffect(() => {
    if (!start || reduced.current) return;
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
  }, [start, char, delay, duration]);

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
  charDelay = 55,
  duration = 850,
  delay = 0,
}: {
  text: string;
  className?: string;
  charDelay?: number;
  duration?: number;
  /** extra wait before the flip starts (ms) — lets parent entrances settle */
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const [armed, setArmed] = useState(false);

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

  return (
    <span ref={ref} className={`inline-flex gap-[3px] ${className}`} role="text" aria-label={text}>
      {text.split("").map((ch, i) =>
        ch === " " ? (
          <span key={i} className="w-[0.6em]" aria-hidden="true" />
        ) : (
          <FlapChar key={i} char={ch} delay={i * charDelay} duration={duration} start={armed} />
        ),
      )}
    </span>
  );
}