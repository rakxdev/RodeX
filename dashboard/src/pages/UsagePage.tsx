import { motion } from "framer-motion";
import { pageTransition, fadeUp, stagger, foldIn } from "@/lib/motion";
import PublicShell from "@/components/PublicShell";

const writes = [
  { k: "writes / min", v: "120", note: "per app — put / update / delete" },
  { k: "reads / min", v: "240", note: "per app — get / query (strong reads cost 2×)" },
];

const reads = [
  { k: "total / min", v: "600", note: "per app — writes + reads combined" },
  { k: "platform pool", v: "1 000", note: "across all apps, per Cloudflare location" },
  { k: "admin surface", v: "60", note: "dashboard + API management" },
];

const storage = [
  { k: "item size", v: "≤ 20 KB", note: "413 above the cap — keeps the 25-WCU budget safe" },
  { k: "storage", v: "25 GB", note: "DynamoDB always-free tier · ap-southeast-1" },
  { k: "daily workers", v: "100 000", note: "requests/day, shared by gateway + dashboard" },
];

const groups = [
  { title: "WRITE BUDGET", rows: writes },
  { title: "READ & PLATFORM", rows: reads },
  { title: "STORAGE & CAPS", rows: storage },
];

export default function UsagePage() {
  return (
    <motion.div {...pageTransition}>
      <PublicShell tag="USAGE">
      <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em] mb-2">
        USAGE & <span className="text-gold">LIMITS</span>
      </h1>
      <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mb-6">
        CAPACITY MATH · FREE-TIER HONEST · THE BUDGET IS THE CONTRACT
      </div>

      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {groups.map((g) => (
          <motion.div key={g.title} variants={foldIn} className="sheet-panel p-5">
            <h4 className="mb-4">
              <b>{g.title}</b>
            </h4>
            <dl className="space-y-0 divide-y divide-line/70">
              {g.rows.map((r) => (
                <div key={r.k} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="font-mono text-[10.5px] tracking-[0.12em] text-inkdim">{r.k}</dt>
                    <dd className="font-mono text-[15px] tracking-[0.04em] text-gold">{r.v}</dd>
                  </div>
                  <div className="font-mono text-[10px] leading-relaxed text-inkdim mt-1">{r.note}</div>
                </div>
              ))}
            </dl>
          </motion.div>
        ))}
      </motion.div>

      {/* budget math */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="sheet-panel p-5 mt-4">
        <h4 className="mb-3">
          <b>WHY IT NEVER THROTTLES</b> — THE MATH
        </h4>
        <p className="font-mono text-[12px] leading-relaxed text-inkdim">
          The free tier grants 25 write units and 25 read units per second. A 20 KB item costs roughly 5 write units
          at 4 KB per unit — so the 120 writes/min budget (~2/s) stays four times under the WU ceiling, and 240
          reads/min (~4/s, or 2 strong reads) sits comfortably inside the RU budget. Even at the caps, the gateway
          never asks DynamoDB for more than the free tier gives.
        </p>
      </motion.div>

      {/* platform feature sheet — criteria + cost for every capability */}
      <motion.div variants={foldIn} initial="hidden" animate="show" className="sheet-panel p-5 mt-4">
        <h4 className="mb-4">
          <b>PLATFORM FEATURE SHEET</b> — WHAT EACH CAPABILITY NEEDS & WHAT IT COSTS
        </h4>
        <table className="doc-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Criteria</th>
              <th>Cost impact</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>Per-app keys</code></td>
              <td>Automatic at fabrication; branded <code>rok_</code>; one shown at issue</td>
              <td>0 — one hashed write per issue/rotate</td>
            </tr>
            <tr>
              <td><code>View key (48 h)</code></td>
              <td>Admin session + within 48 h of last issue/rotate</td>
              <td>0 — one read + in-worker AES decrypt</td>
            </tr>
            <tr>
              <td><code>Per-app tables</code></td>
              <td>Created via API; owned by one app; <code>app_&lt;id&gt;_&lt;name&gt;</code></td>
              <td>1 WCU + 1 RCU provisioned each (25+25 free account-wide)</td>
            </tr>
            <tr>
              <td><code>Idempotent writes</code></td>
              <td>Pass <code>request_id</code>; deduped 24 h</td>
              <td>1 write per unique id; TTL expiry deletes free (0 WCU)</td>
            </tr>
            <tr>
              <td><code>Version conflicts</code></td>
              <td>Pass <code>expected_version</code> on update/delete</td>
              <td>0 — conditional write, same unit cost as a normal write</td>
            </tr>
            <tr>
              <td><code>Soft delete + recover</code></td>
              <td>Any app; 5-min window; purge after</td>
              <td>0 — status flag + one-time TTL marker</td>
            </tr>
            <tr>
              <td><code>App notes</code></td>
              <td>Optional ≤ 200 chars at fabrication</td>
              <td>0 — plain attribute</td>
            </tr>
            <tr>
              <td><code>Password change</code></td>
              <td>Logged-in session + correct old password; new ≥ 12 chars, differs</td>
              <td>0 — hash stored in platform settings (env password = factory default)</td>
            </tr>
            <tr>
              <td><code>Storage</code></td>
              <td><b>No per-app cap</b> — 25 GB shared across all apps (always-free tier)</td>
              <td>Free up to 25 GB total</td>
            </tr>
          </tbody>
        </table>
      </motion.div>

      {/* 429 field manual — scenarios + fixes */}
      <motion.div variants={foldIn} initial="hidden" animate="show" className="sheet-panel p-5 mt-4">
        <h4 className="mb-4">
          <b>429 FIELD MANUAL</b> — WHAT TRIGGERS IT, HOW TO READ IT, HOW TO NEVER SEE IT
        </h4>
        <table className="doc-table">
          <thead>
            <tr>
              <th>Symptom</th>
              <th>Cause</th>
              <th>Recovery</th>
              <th>Prevention</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>429</code> with <code>retry_after: 1</code></td>
              <td>one of the per-app buckets topped out this minute</td>
              <td>wait <code>retry_after</code> seconds, retry — writes with <code>request_id</code> are always safe to retry</td>
              <td>stay under 600 total / 120 writes / 240 reads per minute</td>
            </tr>
            <tr>
              <td><code>429</code> on every call, all apps</td>
              <td>platform pool (1 000/min) shared across your apps</td>
              <td>spread calls; stagger cron jobs by a few seconds</td>
              <td>run heavy jobs off-peak; cache hot reads</td>
            </tr>
            <tr>
              <td><code>429</code> while fast-clicking the console</td>
              <td>admin surface: 60 req/min</td>
              <td>pause a second — the UI never hits this on its own</td>
              <td>—</td>
            </tr>
            <tr>
              <td><code>413</code> (not 429)</td>
              <td>row over 20 KB — a size ceiling, not a rate</td>
              <td>reduce the payload</td>
              <td>keep rows small; store blobs elsewhere</td>
            </tr>
          </tbody>
        </table>
        <p className="font-mono text-[11px] leading-relaxed text-inkdim mt-4">
          The numbers, exactly: <span className="text-ink">600 req/min total</span> ·{" "}
          <span className="text-ink">120 writes/min</span> · <span className="text-ink">240 reads/min</span> per app —{" "}
          <span className="text-ink">1 000 req/min platform pool</span> — <span className="text-ink">60 req/min admin</span>.
          A 429 is a bucket, not a ban: it resets within the minute, and if you throttle to ~80% of the budget you{" "}
          <span className="text-ink">should never see it again</span>.
        </p>
      </motion.div>

      {/* safety boundaries — how to never hit a limit */}
      <motion.div variants={foldIn} initial="hidden" animate="show" className="sheet-panel p-5 mt-4">
        <h4 className="mb-4">
          <b>SAFETY BOUNDARIES</b> — HOW TO STAY UNDER, WITH REAL USE CASES
        </h4>
        <ol className="space-y-3">
          {[
            ["Keep rows small", "20 KB is the ceiling, not a target. A 4 KB row costs half the write budget of a 19 KB row — store big payloads as a URL/object key, not inline."],
            ["Batch reads into queries", "Fetching 50 rows? One query with sk_prefix + limit 50 costs 1 read, not 50. Get-by-pk is for single lookups only."],
            ["Strong reads are 2×", "strong:true costs 2 read units — use it only when a stale read would break the app (e.g. right after a critical write), never in hot loops."],
            ["Writes are the scarce budget", "120 writes/min per app. Prefer update (replace data) over delete+put; coalesce bursts; queue writes client-side if a batch exceeds the budget."],
            ["Retries are always safe", "Send request_id on every write and retry freely — the gateway dedupes for 24 h. On 429/502/503, back off retry_after seconds (default 1)."],
            ["Guard against lost updates", "Read the version, update with expected_version, handle the 409 — your app never silently overwrites a concurrent change."],
            ["Treat 429 as the meter", "If you ever see 429, you are at the boundary: hold 1-2 s and throttle to ~80% of the budget. The gateway is built so this should be rare, not routine."],
          ].map(([k, v], i) => (
            <li key={k} className="flex gap-3">
              <span className="font-mono text-[10px] leading-6 text-gold shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="font-mono text-[12px] text-ink">{k}</div>
                <div className="font-mono text-[11px] leading-relaxed text-inkdim mt-0.5">{v}</div>
              </div>
            </li>
          ))}
        </ol>
      </motion.div>

      <p className="font-mono text-[10px] sm:text-[10.5px] tracking-[0.1em] text-inkdim mt-5">
        REAL-TIME PER-APP METERS SHIP WITH THE OBSERVABILITY PHASE — THE BUDGET TABLE ABOVE IS THE CONTRACT TODAY.
      </p>
      </PublicShell>
    </motion.div>
  );
}