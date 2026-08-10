import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { pageTransition, foldIn, stagger } from "@/lib/motion";
import PublicShell from "@/components/PublicShell";
import type { ReactNode } from "react";

const GW = "https://rodex-gateway.rakxdev.workers.dev";

/* ── small doc primitives ──────────────────────────────────────────────── */

/** Code block with # comment highlighting + a copy button. */
function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const lines = children.replace(/^\n/, "").split("\n");
  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 z-10 font-mono text-[8.5px] tracking-[0.16em] px-2 py-1 rounded-md border border-line bg-panel2 text-inkdim hover:text-ink hover:border-gold/50 transition-colors"
        aria-label="Copy code"
      >
        {copied ? "COPIED ✓" : "COPY"}
      </button>
      <pre className="code-block whitespace-pre">
        <code>
          {lines.map((line, i) => (
            <span key={i} className={line.trimStart().startsWith("#") ? "cmt" : undefined}>
              {line}
              {i < lines.length - 1 ? "\n" : ""}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Method({ verb }: { verb: "POST" | "GET" | "DELETE" }) {
  return (
    <span className={`method-chip ${verb === "POST" ? "post" : verb === "DELETE" ? "delete" : ""}`}>{verb}</span>
  );
}

function H({ children }: { children: ReactNode }) {
  return <div className="font-mono text-[12px] text-ink tracking-[0.04em] mb-2">{children}</div>;
}

function Section({ cell, title, anchor, children }: { cell: string; title: string; anchor: string; children: ReactNode }) {
  return (
    <motion.section id={anchor} variants={foldIn} className="sheet-panel p-5 sm:p-6 scroll-mt-24">
      <h4 className="mb-4">
        <b>CELL {cell}</b> · {title}
      </h4>
      {children}
    </motion.section>
  );
}

function P({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[12px] leading-relaxed text-inkdim mb-4 last:mb-0 ${className}`}>{children}</p>;
}

/* ── page ──────────────────────────────────────────────────────────────── */

const toc = [
  { a: "quickstart", label: "QUICKSTART" },
  { a: "auth", label: "AUTHENTICATION" },
  { a: "tables", label: "TABLES" },
  { a: "items", label: "ITEMS" },
  { a: "query", label: "QUERY" },
  { a: "idempotency", label: "IDEMPOTENCY" },
  { a: "modeling", label: "DATA MODELING" },
  { a: "admin", label: "ADMIN API" },
  { a: "limits", label: "LIMITS" },
  { a: "playbook", label: "RATE-LIMIT PLAYBOOK" },
  { a: "mcp", label: "MCP — AGENTS" },
  { a: "errors", label: "ERRORS" },
];

export default function DocsPage() {
  const [active, setActive] = useState<string>(toc[0].a);

  // scroll-spy: highlight the TOC entry for the section currently in view
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = window.scrollY + window.innerHeight * 0.35;
        let current = toc[0].a;
        for (const t of toc) {
          const el = document.getElementById(t.a);
          if (el && el.getBoundingClientRect().top + window.scrollY <= mid) current = t.a;
        }
        setActive(current);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <motion.div {...pageTransition}>
      <PublicShell tag="DOCS">
      <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em] mb-2">
        API <span className="text-gold">REFERENCE</span>
      </h1>
      <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mb-1">
        ONE CONTRACT · EVERY APP · V1
      </div>
      <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mb-6">
        BASE <span className="text-ink">—</span> <span className="text-gold">{GW}</span>
      </div>

      {/* mobile section chips — sticky so the map is always reachable */}
      <nav
        className="lg:hidden sticky top-[53px] z-30 -mx-1 px-1 bg-bg/95 backdrop-blur flex gap-1.5 overflow-x-auto no-scrollbar pb-3 mb-1"
        aria-label="Documentation sections"
      >
        {toc.map((t) => (
          <a
            key={t.a}
            href={`#${t.a}`}
            aria-current={active === t.a ? "true" : undefined}
            className={`shrink-0 font-mono text-[9.5px] tracking-[0.14em] px-2.5 py-1.5 rounded-md border transition-colors ${
              active === t.a ? "text-gold border-gold/50 bg-gold/5" : "text-inkdim border-line hover:text-ink"
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[190px_1fr] gap-6">
        {/* TOC (desktop) */}
        <nav className="hidden lg:block" aria-label="Documentation sections">
          <motion.div variants={stagger(0.02)} initial="hidden" animate="show" className="sticky top-20 flex flex-col gap-1">
            <div className="font-mono text-[9px] tracking-[0.24em] text-inkdim mb-2">INDEX</div>
            {toc.map((t) => (
              <motion.a
                key={t.a}
                variants={foldIn}
                href={`#${t.a}`}
                aria-current={active === t.a ? "true" : undefined}
                className={`font-mono text-[10.5px] tracking-[0.16em] py-1 transition-colors ${
                  active === t.a ? "text-gold" : "text-inkdim hover:text-ink"
                }`}
              >
                {active === t.a ? "▸ " : ""}
                {t.label}
              </motion.a>
            ))}
          </motion.div>
        </nav>

        <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="flex flex-col gap-4 min-w-0">
          <Section cell="01" title="QUICKSTART" anchor="quickstart">
            <P>
              Every app gets its own credentials and its own prefixed tables. Fabricate the app on the APP BOARD — the
              API key is revealed <span className="text-gold">exactly once</span> (gold seal) — then:
            </P>
            <div className="space-y-3">
              <div>
                <H>1 — CREATE A TABLE</H>
                <Code>{`# $GW = ${GW}
curl -X POST $GW/v1/table/create \\
  -H "X-App-Id: <app_id>" \\
  -H "X-Api-Key: <api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "users"}'`}</Code>
              </div>
              <div>
                <H>2 — WRITE A ROW</H>
                <Code>{`curl -X POST $GW/v1/item/put \\
  -H "X-App-Id: <app_id>" \\
  -H "X-Api-Key: <api_key>" \\
  -d '{"table": "users", "item": {"pk": "USER#1", "name": "rakxdev"}}'`}</Code>
              </div>
              <div>
                <H>3 — READ IT BACK</H>
                <Code>{`curl -X POST $GW/v1/item/get \\
  -H "X-App-Id: <app_id>" \\
  -H "X-Api-Key: <api_key>" \\
  -d '{"table": "users", "pk": "USER#1"}'`}</Code>
              </div>
            </div>
          </Section>

          <Section cell="02" title="AUTHENTICATION" anchor="auth">
            <P>Every request carries two headers. Keys are stored HMAC-hashed — the gateway cannot read them back; a leaked key is neutralized by rotation, never by a password reset.</P>
            <table className="doc-table mb-4">
              <thead>
                <tr>
                  <th>Header</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>X-App-Id</code></td>
                  <td>app id shown on the app board (S/N)</td>
                </tr>
                <tr>
                  <td><code>X-Api-Key</code></td>
                  <td>the 43-char key revealed once at creation</td>
                </tr>
              </tbody>
            </table>
            <P>
              Statuses: <span className="text-amberx">active</span> serves traffic ·{" "}
              <span className="text-inkdim">suspended</span> returns 403 · <span className="text-redx">deleting</span>{" "}
              returns 403 during the 5-minute recovery window. Rotating the key invalidates the old one instantly.
            </P>
            <P>
              Keys are branded — they start with <code className="text-ink">rok_</code> — and are shown once at issue.
              For 48 hours after creation or rotation the console can <span className="text-gold">VIEW KEY</span> (the raw key
              is stored AES-GCM encrypted, decrypted on demand); after that only the HMAC hash remains and rotation is the
              way to a fresh key. The old key dies the moment you rotate.
            </P>
          </Section>

          <Section cell="03" title="TABLES" anchor="tables">
            <P>
              Tables are created per app and physically named <code className="text-ink">app_&lt;app_id&gt;_&lt;name&gt;</code>.
              No app can read, write, or delete another app's tables — isolation is enforced at the storage layer, not by convention.
            </P>
            <div className="space-y-3">
              <div>
                <H><Method verb="POST" /> <span className="text-ink">/v1/table/create</span> — register a table</H>
                <Code>{`{ "name": "users", "request_id": "optional" }
→ 200 { "ok": true, "result": { "name": "users", "physical": "app_<id>_users" } }
→ 409 table already exists · 400 invalid name`}</Code>
              </div>
              <div>
                <H><Method verb="GET" /> <span className="text-ink">/v1/tables</span> — list the app's tables</H>
                <Code>{`→ 200 { "ok": true, "result": { "tables": ["users", "messages"] } }`}</Code>
              </div>
            </div>
          </Section>

          <Section cell="04" title="ITEMS" anchor="items">
            <P>
              Rows are keyed by <code className="text-ink">pk</code> (required, ≤ 500 chars) and{" "}
              <code className="text-ink">sk</code> (optional, defaults to <code className="text-ink">"~"</code>) — the
              classic single-table composite-key model. Payloads are capped at 20 KB (413).
            </P>
            <div className="space-y-3">
              <div>
                <H><Method verb="POST" /> <span className="text-ink">/v1/item/put</span> — write a row</H>
                <Code>{`{
  "table": "users",
  "item": { "pk": "USER#1", "sk": "PROFILE", "name": "rakxdev" },
  "overwrite": false,
  "request_id": "req-1"
}
→ 200 version 1 · duplicate without overwrite → 409`}</Code>
              </div>
              <div>
                <H><Method verb="POST" /> <span className="text-ink">/v1/item/get</span> — read one row</H>
                <Code>{`{ "table": "users", "pk": "USER#1", "sk": "PROFILE", "strong": false }
→ 200 { "ok": true, "result": { "data": {...}, "version": 1, "created": "...", "updated": "..." } }
→ 404 missing row  (strong: true = strongly consistent, 2× read cost)`}</Code>
              </div>
              <div>
                <H><Method verb="POST" /> <span className="text-ink">/v1/item/update</span> — replace the payload</H>
                <Code>{`{
  "table": "users", "pk": "USER#1", "sk": "PROFILE",
  "data": { "name": "rakxdev-v2" },
  "expected_version": 1,
  "request_id": "req-2"
}
→ 200 version 2 · expected_version mismatch → 409 · missing row → 404`}</Code>
              </div>
              <div>
                <H><Method verb="POST" /> <span className="text-ink">/v1/item/delete</span> — remove a row</H>
                <Code>{`{ "table": "users", "pk": "USER#1", "sk": "PROFILE", "expected_version": 2 }
→ 200 { "ok": true, "result": { "deleted": true } }`}</Code>
              </div>
            </div>
          </Section>

          <Section cell="05" title="QUERY" anchor="query">
            <div>
              <H><Method verb="POST" /> <span className="text-ink">/v1/query</span> — range scan on pk</H>
              <Code>{`{
  "table": "users",
  "pk": "USER#1",
  "sk_prefix": "MSG#",
  "limit": 50,
  "start_key": "opaque"
}
→ 200 {
     "items": [ { "data": {...}, "version": 1, "created": "...", "updated": "..." } ],
     "has_more": true,
     "next_start_key": "opaque"
   }`}</Code>
              <P className="mt-3">
                <code className="text-ink">limit</code> max 100. When <code className="text-ink">has_more</code> is
                true, pass <code className="text-ink">next_start_key</code> back as{" "}
                <code className="text-ink">start_key</code> for the next page.
              </P>
            </div>
          </Section>

          <Section cell="06" title="IDEMPOTENCY & CONFLICTS" anchor="idempotency">
            <P>
              Writes are safe to retry. Send the same <code className="text-ink">request_id</code> (header{" "}
              <code className="text-ink">X-Request-Id</code> or body field) and the gateway returns the original result
              for 24 hours — no duplicates, ever. Reads and deletes may also carry it.
            </P>
            <P>
              Optimistic concurrency: pass <code className="text-ink">expected_version</code> on update/delete and the
              gateway rejects the operation with 409 if the row moved. Read → modify → write with the version you read.
            </P>
          </Section>

          <Section cell="07" title="DATA MODELING & SCHEMA DESIGN" anchor="modeling">
            <P>
              RodeX follows the DynamoDB single-table discipline: every row is keyed by{" "}
              <code className="text-ink">pk</code> (hash, required) and <code className="text-ink">sk</code>{" "}
              (sort, optional, defaults to <code className="text-ink">"~"</code>). The sk is a physical sort key —
              design it so that the order you read in is the order you write in.
            </P>
            <table className="doc-table mb-4">
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>pk</th>
                  <th>sk</th>
                  <th>Use case</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>Entity row</code></td>
                  <td><code>USER#1</code></td>
                  <td><code>PROFILE</code></td>
                  <td>exactly one row per entity</td>
                </tr>
                <tr>
                  <td><code>Time log</code></td>
                  <td><code>DEVICE#7</code></td>
                  <td><code>EVT#1786300000</code></td>
                  <td>events sorted by time — newest last</td>
                </tr>
                <tr>
                  <td><code>Inbox/outbox</code></td>
                  <td><code>USER#1</code></td>
                  <td><code>MSG#&lt;epoch&gt;#&lt;seq&gt;</code></td>
                  <td>messages, paginated oldest→newest</td>
                </tr>
                <tr>
                  <td><code>Status set</code></td>
                  <td><code>ORDER#9</code></td>
                  <td><code>STATE</code></td>
                  <td>current state, updated with <code>expected_version</code></td>
                </tr>
              </tbody>
            </table>
            <P className="mb-4">Design rules:</P>
            <ul className="font-mono text-[11.5px] text-inkdim space-y-2 mb-4 list-none">
              <li>— <b className="text-ink">Read order = sk order.</b> Put the timestamp (or the natural range) in sk when you will page through rows.</li>
              <li>— <b className="text-ink">One row per entity.</b> Prefer updating one row over delete+put pairs (writes are the scarce budget).</li>
              <li>— <b className="text-ink">Keep rows ≤ 20 KB.</b> Big payloads belong in object storage; store the URL in the row.</li>
              <li>— <b className="text-ink">Avoid hot keys.</b> Spread frequent writes across several pks (e.g. <code>[0-9]#&lt;id&gt;</code>) when one key would absorb all traffic.</li>
              <li>— <b className="text-ink">Version everything mutable.</b> Read the version, write with <code>expected_version</code>, handle the 409.</li>
              <li>— <b className="text-ink">All keys carry your app's id</b> inside the table — <code>app_&lt;id&gt;_&lt;name&gt;</code> is always the physical name.</li>
            </ul>
            <P>
              Example — a chat app: table <code className="text-ink">chat</code> with rows{" "}
              <code className="text-ink">USER#1 / PROFILE</code>, <code className="text-ink">USER#1 / MSG#&lt;epoch&gt;</code>,{" "}
              <code className="text-ink">ROOM#a / LAST_READ#USER#1</code>. Queries: one sk_prefix per room, limit 50, page with{" "}
              <code className="text-ink">next_start_key</code>.
            </P>
          </Section>

          <Section cell="08" title="ADMIN API" anchor="admin">
            <P>The console itself runs on this surface — session cookie or bearer token, 12 h TTL.</P>
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>POST /v1/admin/login</code></td>
                  <td>password login → session</td>
                </tr>
                <tr>
                  <td><code>GET /v1/auth/github/start</code></td>
                  <td>GitHub OAuth start (302)</td>
                </tr>
                <tr>
                  <td><code>GET /v1/auth/github/callback</code></td>
                  <td>OAuth callback → console</td>
                </tr>
                <tr>
                  <td><code>GET /v1/admin/me</code></td>
                  <td>session state + allowed users</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/logout</code></td>
                  <td>destroy session</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/change-password</code></td>
                  <td>rotate the console password (PROFILE — old + new)</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/apps</code></td>
                  <td>create app → key shown once</td>
                </tr>
                <tr>
                  <td><code>GET /v1/admin/apps</code></td>
                  <td>list apps</td>
                </tr>
                <tr>
                  <td><code>GET /v1/admin/apps/:id</code></td>
                  <td>app detail</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/apps/:id/rotate-key</code></td>
                  <td>new key, old one dies instantly</td>
                </tr>
                <tr>
                  <td><code>GET /v1/admin/apps/:id/usage</code></td>
                  <td>live meters — request budgets + storage</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/mcp/keys</code></td>
                  <td>mint a master key → <code>rok_mcp_…</code> (re-viewable anytime)</td>
                </tr>
                <tr>
                  <td><code>GET /v1/admin/mcp/keys</code></td>
                  <td>list master keys (metadata only)</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/mcp/keys/:id/view</code></td>
                  <td>re-view a master key — anytime, no window</td>
                </tr>
                <tr>
                  <td><code>DELETE /v1/admin/mcp/keys/:id</code></td>
                  <td>destroy a master key (no rotation — delete + recreate)</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/apps/:id/suspend · resume</code></td>
                  <td>block / unblock traffic</td>
                </tr>
                <tr>
                  <td><code>DELETE /v1/admin/apps/:id</code></td>
                  <td>soft delete — 5 min recovery window</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/apps/:id/recover</code></td>
                  <td>cancel soft delete</td>
                </tr>
                <tr>
                  <td><code>POST /v1/admin/apps/:id/force-delete</code></td>
                  <td>purge all tables + registry now</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section cell="09" title="LIMITS" anchor="limits">
            <P>Engineered so the always-free DynamoDB budget is never hit — these are the contract.</P>
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Bound</th>
                  <th>Limit</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Item size</td>
                  <td>≤ 20 KB per row (413 above)</td>
                </tr>
                <tr>
                  <td>Per app · total</td>
                  <td>600 req/min (429 with retry_after)</td>
                </tr>
                <tr>
                  <td>Per app · writes</td>
                  <td>120 / min</td>
                </tr>
                <tr>
                  <td>Per app · reads</td>
                  <td>240 / min</td>
                </tr>
                <tr>
                  <td>Platform pool</td>
                  <td>1 000 req/min across apps</td>
                </tr>
                <tr>
                  <td>Admin surface</td>
                  <td>60 req/min</td>
                </tr>
                <tr>
                  <td>Storage</td>
                  <td>25 GB DynamoDB free tier · ap-southeast-1</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section cell="10" title="RATE-LIMIT PLAYBOOK" anchor="playbook">
            <P>
              Limits are buckets, not averages: a request counts the minute it arrives, and{" "}
              <span className="text-redx">429</span> comes with <code className="text-ink">retry_after</code> (seconds).
              The symptom → cause → fix table:
            </P>
            <table className="doc-table mb-4">
              <thead>
                <tr>
                  <th>Symptom</th>
                  <th>Cause</th>
                  <th>Fix</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>429</code> on bursts of writes</td>
                  <td>&gt; 120 writes in one minute</td>
                  <td>queue writes client-side; spread over seconds; coalesce updates</td>
                </tr>
                <tr>
                  <td><code>429</code> on reads</td>
                  <td>&gt; 240 reads/min — often N+1 gets</td>
                  <td>one query with sk_prefix + limit instead of many gets</td>
                </tr>
                <tr>
                  <td><code>429</code> on everything</td>
                  <td>&gt; 600 total req/min</td>
                  <td>back off, cache responses, gossip between instances</td>
                </tr>
                <tr>
                  <td><code>429</code> early on a fresh key</td>
                  <td>platform pool (1 000/min) shared across apps</td>
                  <td>spread traffic; stagger cron jobs</td>
                </tr>
                <tr>
                  <td><code>429</code> on the console</td>
                  <td>admin surface 60/min (fast clicking)</td>
                  <td>slow down; the UI never throttles itself</td>
                </tr>
                <tr>
                  <td><code>413</code> instead of 429</td>
                  <td>payload over 20 KB — different ceiling</td>
                  <td>shrink the row; store blobs elsewhere</td>
                </tr>
              </tbody>
            </table>
            <P>
              The honest math: 120 writes/min ≈ 2 writes/sec ≈ 2 WCU — under the table's burst capacity, so steady apps{" "}
              <span className="text-ink">never see 429 by design</span>. The boundaries above are the contract; treat{" "}
              <span className="text-redx">429 as the meter</span> — if you ever see it, throttle to ~80% of the budget and it resolves within the minute.
            </P>
          </Section>

          <Section cell="11" title="MCP — AGENTS" anchor="mcp">
            <P>
              The gateway speaks the <span className="text-ink">Model Context Protocol</span> at{" "}
              <code className="text-ink">{`${GW}/mcp`}</code> — one endpoint that every MCP-capable coding
              agent (Cursor, Claude Code, VS Code/Copilot, Windsurf, Zed, Gemini CLI, Codex, …) can connect
              to. With one <span className="text-ink">master key</span> an agent can operate the entire
              platform: every app, every table, every item. Full reference:{" "}
              <a className="text-gold hover:underline" href="https://github.com/rakxdev/RodeX/blob/main/docs/mcp.md" target="_blank" rel="noreferrer">docs/mcp.md</a>.
            </P>

            <H>MASTER KEYS</H>
            <P>
              Keys are <code className="text-ink">rok_mcp_</code> + 43 base64url chars (256-bit), minted{" "}
              <span className="text-ink">only in the console</span> (MCP page — name + description). Stored
              hash-only; re-viewable <span className="text-ink">anytime</span>; delete = instant revocation.
              <span className="text-ink"> No rotation</span> — delete and recreate. Send it on every request:
            </P>
            <Code>{`Authorization: Bearer rok_mcp_…`}</Code>

            <H>CONNECTING AGENTS</H>
            <P><span className="text-ink">Cursor</span> — <code className="text-ink">.cursor/mcp.json</code>:</P>
            <Code>{`{ "mcpServers": {
  "rodex": {
    "url": "${GW}/mcp",
    "headers": { "Authorization": "Bearer ${'${env:RODEX_MCP_KEY}'}" }
  }
} }`}</Code>
            <P><span className="text-ink">Claude Code / CLI agents</span>:</P>
            <Code>{`export RODEX_MCP_KEY=rok_mcp_…
claude mcp add --transport http rodex ${GW}/mcp \\
  --header "Authorization: Bearer $RODEX_MCP_KEY"`}</Code>
            <P><span className="text-ink">stdio-only clients</span> (Claude Desktop, anything that only runs
            local servers) — the official bridge:</P>
            <Code>{`npx mcp-remote ${GW}/mcp \\
  --header "Authorization: Bearer $RODEX_MCP_KEY"`}</Code>
            <P>Never paste a key into a chat — reference <code className="text-ink">{"${env:RODEX_MCP_KEY}"}</code> instead.</P>

            <H>TOOLS — 21</H>
            <table className="doc-table mb-4">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Kind</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>health</code> · <code>get_instructions</code></td><td>read</td><td>status + the operating manual</td></tr>
                <tr><td><code>list_apps</code> · <code>get_app</code></td><td>read</td><td>app inventory + details</td></tr>
                <tr><td><code>list_tables</code></td><td>read</td><td>tables of an app</td></tr>
                <tr><td><code>get_item</code> · <code>query</code></td><td>read</td><td>read data (sk defaults to <code>~</code>; paginate with <code>next_start_key</code>)</td></tr>
                <tr><td><code>get_app_usage</code></td><td>read</td><td>live request budgets + storage — the meters as data</td></tr>
                <tr><td><code>create_app</code> · <code>delete_app</code></td><td><span className="text-amber">mutate — confirm</span></td><td>app lifecycle</td></tr>
                <tr><td><code>suspend_app</code> · <code>resume_app</code></td><td><span className="text-amber">mutate — confirm</span></td><td>emergency stop / restart</td></tr>
                <tr><td><code>rotate_app_key</code> · <code>view_app_key</code></td><td><span className="text-amber">mutate — confirm</span></td><td>new app key (old dies instantly) · re-view inside 48 h window</td></tr>
                <tr><td><code>recover_app</code> · <code>force_delete_app</code></td><td><span className="text-amber">mutate — confirm</span></td><td>undo soft delete · immediate purge (no window)</td></tr>
                <tr><td><code>create_table</code> · <code>delete_table</code></td><td><span className="text-amber">mutate — confirm</span></td><td>table lifecycle (delete is irreversible)</td></tr>
                <tr><td><code>put_item</code> · <code>update_item</code> · <code>delete_item</code></td><td><span className="text-amber">mutate — confirm</span></td><td>item lifecycle (version-guarded, 20 KB cap)</td></tr>
              </tbody>
            </table>

            <H>THE CONFIRMATION GATE</H>
            <P>
              Every mutation requires <code className="text-ink">confirmed: true</code> in its arguments.{" "}
              <span className="text-ink">Without it, nothing executes</span> — the server refuses with a
              structured <code className="text-ink">confirmation_required</code> response that names exactly
              what would happen, and the agent must relay it to you and obtain your explicit approval before
              retrying. This is enforced server-side, not by prompt. The same protocol is baked into{" "}
              <code className="text-ink">get_instructions</code> and the console manual.
            </P>

            <H>BUDGETS</H>
            <P>
              MCP traffic: <span className="text-ink">600 total / 120 writes / 240 reads per minute</span>{" "}
              (platform-wide), counted by the same single-point limiter as app traffic. App budgets also apply
              — an agent's writes show up in the app's LIVE METERS. 429s name the budget and carry retry seconds.
            </P>
            <P className="mb-0">
              Errors: <code className="text-ink">401</code> bad key · <code className="text-ink">400</code> invalid
              arguments · <code className="text-ink">403/404</code> unknown app/table ·{" "}
              <code className="text-ink">409</code> version conflict · <code className="text-ink">429</code> budget.
              All tool results are structured JSON — never raw crashes.
            </P>
          </Section>

          <Section cell="12" title="ERRORS" anchor="errors">
            <P>
              Every error is JSON: <code className="text-ink">{"{ \"ok\": false, \"error\": { \"code\": 409, \"message\": \"…\" } }"}</code>
            </P>
            <table className="doc-table mb-4">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>400</code></td><td>malformed request</td></tr>
                <tr><td><code>401</code></td><td>missing / bad credentials</td></tr>
                <tr><td><code>403</code></td><td>not your table · app suspended / deleting</td></tr>
                <tr><td><code>404</code></td><td>row or app not found</td></tr>
                <tr><td><code>409</code></td><td>conflict — duplicate row, version mismatch</td></tr>
                <tr><td><code>413</code></td><td>payload over 20 KB</td></tr>
                <tr><td><code>415</code></td><td>POST without Content-Type: application/json</td></tr>
                <tr><td><code>429</code></td><td>rate limit — retry after <code>retry_after</code> seconds</td></tr>
                <tr><td><code>502 / 503</code></td><td>infrastructure — safe to retry</td></tr>
              </tbody>
            </table>
            <P>
              Retry rule: on 429 / 502 / 503, wait <code className="text-ink">retry_after</code> (default 1 s) and
              retry. Writes carrying a <code className="text-ink">request_id</code> are always safe to retry.
            </P>
          </Section>

          <div className="flex flex-col gap-1 px-1 pb-2">
            <div className="foldline" />
            <div className="font-mono text-[10px] tracking-[0.16em] text-inkdim pt-2">
              FULL CONTRACT — <a className="text-gold hover:underline" href="https://github.com/rakxdev/RodeX/blob/main/docs/openapi.yaml" target="_blank" rel="noreferrer">OPENAPI.YAML</a> · <a className="text-gold hover:underline" href="https://github.com/rakxdev/RodeX/blob/main/docs/api.md" target="_blank" rel="noreferrer">API.MD</a>
            </div>
          </div>
        </motion.div>
      </div>
      </PublicShell>
    </motion.div>
  );
}
