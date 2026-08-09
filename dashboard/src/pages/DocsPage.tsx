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
  { a: "admin", label: "ADMIN API" },
  { a: "limits", label: "LIMITS" },
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

          <Section cell="07" title="ADMIN API" anchor="admin">
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

          <Section cell="08" title="LIMITS" anchor="limits">
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

          <Section cell="09" title="ERRORS" anchor="errors">
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
