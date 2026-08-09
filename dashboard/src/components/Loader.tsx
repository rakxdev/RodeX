/**
 * Loader — Instrument-Packet themed activity mark: a slow-turning diamond
 * frame with a gold tick and a mono readout. Used wherever the app waits on
 * the network (session verification, app board, app detail, actions).
 */
export default function Loader({ label = "LOADING", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className="loader-wrap grid place-items-center py-10" role="status" aria-label={label}>
      <div className="flex flex-col items-center gap-3">
        <div className="loader-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path d="M32 8 L56 32 L32 56 L8 32 Z" fill="none" stroke="#2a2f37" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M32 14 L50 32 L32 50 L14 32 Z" fill="none" stroke="#8A9184" strokeWidth="1.4" strokeLinejoin="round" />
            <rect x="22" y="6" width="20" height="5" fill="#D9B64A" className="loader-tick" />
            <circle cx="32" cy="32" r="2.2" fill="#E8452C" />
          </svg>
        </div>
        <div className="loader-bar" aria-hidden="true" />
        {!compact && (
          <div className="font-mono text-[9.5px] sm:text-[10px] tracking-[0.26em] text-inkdim">
            {label}
            <span className="loader-dots" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}