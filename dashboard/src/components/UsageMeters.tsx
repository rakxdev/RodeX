import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/client";
import { istDate } from "@/lib/utils";

interface Meter {
  used: number;
  limit: number;
  remaining: number;
}

interface UsageData {
  window_seconds: number;
  requests: { total: Meter; writes: Meter; reads: Meter; platform: Meter };
  storage: { bytes: number; items: number; tables: number; sampled_at: number };
}

function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function Bar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const hot = pct >= 80;
  return (
    <div className="h-1.5 rounded-full bg-line/70 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className={`h-full rounded-full ${hot ? "bg-redx" : "bg-amberx"}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}

/**
 * LIVE METERS — the observability panel. Reads the gateway's single-point
 * limiter counters (peek, zero cost) + DescribeTable storage (60 s cache).
 * Auto-refreshes every 30 s; degrades to "—" silently on errors.
 */
export default function UsageMeters({ appId }: { appId: string }) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await api.get<UsageData>(`/v1/admin/apps/${appId}/usage`);
      setUsage(r);
      setError(false);
      setLastAt(Date.now());
    } catch (err) {
      setError(true);
      void err;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [appId]);

  const rows: Array<{ label: string; meter?: Meter; right: string }> = [
    { label: "WRITES · THIS MINUTE", meter: usage?.requests.writes, right: usage ? `${usage.requests.writes.used} / ${usage.requests.writes.limit}` : "—" },
    { label: "READS · THIS MINUTE", meter: usage?.requests.reads, right: usage ? `${usage.requests.reads.used} / ${usage.requests.reads.limit}` : "—" },
    { label: "TOTAL · THIS MINUTE", meter: usage?.requests.total, right: usage ? `${usage.requests.total.used} / ${usage.requests.total.limit}` : "—" },
    { label: "PLATFORM POOL · ALL APPS", meter: usage?.requests.platform, right: usage ? `${usage.requests.platform.used} / ${usage.requests.platform.limit}` : "—" },
  ];

  return (
    <div>
      <div className="space-y-3 mb-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.12em] mb-1">
              <span className="text-inkdim">{r.label}</span>
              <span className={usage && r.meter && r.meter.used / r.meter.limit >= 0.8 ? "text-redx" : "text-ink"}>
                {r.right}
              </span>
            </div>
            {r.meter && <Bar used={r.meter.used} limit={r.meter.limit} />}
          </div>
        ))}
      </div>

      <div className="foldline mb-3" />

      {/* storage */}
      <div className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.12em] mb-1">
        <span className="text-inkdim">STORAGE · THIS APP</span>
        <span className="text-ink">{usage ? `${fmtBytes(usage.storage.bytes)} used · ${usage.storage.items.toLocaleString("en-IN")} items` : "—"}</span>
      </div>
      <div className="font-mono text-[9.5px] tracking-[0.12em] text-inkdim">
        {usage ? `${usage.storage.tables} table(s) · 25 GB account-wide · sampled every 60 s` : "—"}
      </div>

      {/* footer */}
      <div className="flex items-center gap-2 mt-4 font-mono text-[9px] tracking-[0.16em] text-inkdim">
        <span className={`w-1.5 h-1.5 rounded-full ${error ? "bg-redx" : busy ? "bg-amberx animate-pulse" : "bg-ok"}`} aria-hidden="true" />
        {error ? "METER OFFLINE — RETRYING" : lastAt ? `LIVE · SAMPLED ${istDate(lastAt / 1000)} IST` : "CONNECTING…"}
        <button
          type="button"
          onClick={load}
          className="ml-auto font-mono text-[9px] tracking-[0.16em] text-inkdim hover:text-gold transition-colors"
          aria-label="Refresh meters"
        >
          REFRESH
        </button>
      </div>
    </div>
  );
}