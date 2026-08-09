import { useEffect, useRef, useState } from "react";

/**
 * TypeTerminal — Aceternity-style typewriter terminal tuned to the
 * Instrument-Packet world: types each gateway command, pauses, clears, loops.
 * Falls back to static text when the OS prefers reduced motion.
 */
const LINES = [
  "$ curl -X POST /v1/table/create",
  '  -d \'{"name":"users"}\'',
  "→ 200 table ready",
  "",
  "$ curl -X POST /v1/item/put",
  '  -d \'{"table":"users","item":{"pk":"USER#1"}}\'',
  "→ 200 ok:true version:1",
  "",
  "$ curl -X POST /v1/query",
  '  -d \'{"table":"users","pk":"USER#1","limit":50}\'',
  "→ items:1 has_more:false",
];

const LINE_MS = 22;
const HOLD_MS = 1500;

export default function TypeTerminal() {
  const [line, setLine] = useState(0);
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (reduced.current) {
      setLine(LINES.length - 1);
      setText(LINES.join("\n"));
      return;
    }
    let alive = true;
    const target = LINES[line];
    const tick = () => {
      if (!alive) return;
      if (text.length < target.length) {
        setText(target.slice(0, text.length + 2));
      } else {
        timer.current = setTimeout(() => {
          if (!alive) return;
          if (line < LINES.length - 1) {
            setLine((l) => l + 1);
            setText("");
          } else {
            setLine(0);
            setText("");
          }
        }, HOLD_MS);
      }
    };
    timer.current = setTimeout(tick, LINE_MS);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, line]);

  const done = line >= LINES.length - 1 && text.length >= LINES[LINES.length - 1].length;

  return (
    <pre className="p-4 sm:p-5 font-mono text-[10.5px] sm:text-[11px] leading-[1.8] overflow-x-auto no-scrollbar">
      <code>
        {reduced.current
          ? LINES.join("\n")
          : `${LINES.slice(0, line).join("\n")}${line > 0 ? "\n" : ""}${text}`}
        {!reduced.current && (
          <span className="type-cursor" style={{ visibility: done ? "hidden" : "visible" }} aria-hidden="true" />
        )}
      </code>
    </pre>
  );
}