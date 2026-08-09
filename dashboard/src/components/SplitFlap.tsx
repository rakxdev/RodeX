import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * SplitFlap — Aceternity "text flipping board" (Vestaboard-style), tuned to
 * the Instrument-Packet world. Each character cycles through random glyphs in
 * a flip cell, then lands on its target. Respects prefers-reduced-motion.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_$#@";

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function FlapChar({ char, delay, duration }: { char: string; delay: number; duration: number }) {
  const [display, setDisplay] = useState(randomGlyph());
  const [live, setLive] = useState(true);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (reduced.current) {
      setDisplay(char);
      setLive(false);
      return;
    }
    const start = Date.now() + delay;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const elapsed = Date.now() - start;
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
  }, [char, delay, duration]);

  return (
    <span className="flap-cell" aria-hidden="true">
      <motion.span
        key={display}
        initial={{ rotateX: 90, opacity: 0.5 }}
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
}: {
  text: string;
  className?: string;
  charDelay?: number;
  duration?: number;
}) {
  return (
    <span className={`inline-flex gap-[3px] ${className}`} role="text" aria-label={text}>
      {text.split("").map((ch, i) =>
        ch === " " ? (
          <span key={i} className="w-[0.6em]" aria-hidden="true" />
        ) : (
          <FlapChar key={i} char={ch} delay={i * charDelay} duration={duration} />
        ),
      )}
    </span>
  );
}