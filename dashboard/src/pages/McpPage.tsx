import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Eye, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { pageTransition, stagger } from "@/lib/motion";
import { istDate } from "@/lib/utils";
import KeyReveal from "@/components/KeyReveal";
import Loader from "@/components/Loader";
import { FoldButton } from "@/components/FoldButton";

/**
 * McpPage — the MCP GATEWAY console page.
 * Left: master-key management (create with name + description, view ANYTIME,
 * delete; no rotation by design). Right: the operating manual — endpoint,
 * per-client connect recipes, the confirmation protocol, tool reference,
 * budgets, error codes, FAQ.
 */

interface McpKey {
  key_id: string;
  name: string;
  description?: string;
  created_at: number;
}

const ENDPOINT = `${location.origin.replace(/\/$/, "")}/mcp`;

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="flex items-center gap-2">
      <div className="font-mono text-[9px] tracking-[0.16em] text-inkdim shrink-0">{label}</div>
      <code className="flex-1 min-w-0 truncate font-mono text-[10.5px] tracking-[0.04em] text-ink bg-panel2 border border-line rounded-md px-2.5 py-1.5">
        {value}
      </code>
      <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="p-1.5 rounded-md text-inkdim hover:text-gold hover:bg-panel2">
        {copied ? <Check className="w-3.5 h-3.5 text-gold" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function Section({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <section className="nameplate p-5">
      <div className="font-mono text-[9.5px] tracking-[0.22em] text-gold mb-1">{tag}</div>
      <h3 className="font-mono text-[13px] tracking-[0.1em] mb-3">{title}</h3>
      <div className="space-y-2.5 text-[12px] leading-relaxed text-inkdim">{children}</div>
    </section>
  );
}

export default function McpPage() {
  const [keys, setKeys] = useState<McpKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kname, setKname] = useState("");
  const [kdesc, setKdesc] = useState("");
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  async function load() {
    try {
      const r = await api.get<{ keys: McpKey[] }>("/v1/admin/mcp/keys");
      setKeys(r.keys ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load master keys");
      setKeys([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!kname.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ key: string; name: string }>("/v1/admin/mcp/keys", {
        name: kname.trim(),
        description: kdesc.trim() || undefined,
      });
      setFresh({ key: r.key, name: r.name });
      setKname("");
      setKdesc("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function viewKey(keyId: string) {
    if (revealed[keyId]) return; // anytime re-view — no window
    try {
      const r = await api.post<{ key: string }>(`/v1/admin/mcp/keys/${encodeURIComponent(keyId)}/view`, {});
      setRevealed((m) => ({ ...m, [keyId]: r.key }));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not view key");
    }
  }

  async function copyKey(keyId: string) {
    const key = revealed[keyId];
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(keyId);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function deleteKey() {
    if (!confirmId) return;
    setBusy(true);
    try {
      await api.delete(`/v1/admin/mcp/keys/${encodeURIComponent(confirmId)}`);
      setConfirmId(null);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div {...pageTransition} className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em]">
            MCP <span className="text-gold">GATEWAY</span>
          </h1>
          <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mt-1">
            UNIVERSAL MASTER-KEY INTERFACE · ONE ENDPOINT · EVERY AGENT
          </div>
        </div>
      </div>

      <motion.div {...stagger} className="grid lg:grid-cols-2 gap-5 items-start">
        {/* ── left: master keys ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          <Section tag="MASTER KEYS" title="Console-only · full platform access · no rotation">
            <p>
              Master keys unlock <em>everything</em> the gateway can do — every app, table, and item —
              for any MCP-capable agent. Keys are created here, named, viewed again anytime, and deleted
              instantly. <span className="text-ink">Rotation is intentionally not offered</span>: delete and
              recreate.
            </p>

            <form onSubmit={create} className="space-y-3 pt-1">
              <div>
                <label htmlFor="mk-name" className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim block mb-1.5">
                  KEY NAME <span className="text-inkdim/60">(REQUIRED · ≤40 CHARS)</span>
                </label>
                <input
                  id="mk-name"
                  value={kname}
                  onChange={(e) => setKname(e.target.value)}
                  placeholder="e.g. claude-code"
                  maxLength={40}
                  className="w-full font-mono text-[12px] tracking-[0.06em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label htmlFor="mk-desc" className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim block mb-1.5">
                  DESCRIPTION <span className="text-inkdim/60">(OPTIONAL · ≤200 CHARS)</span>
                </label>
                <input
                  id="mk-desc"
                  value={kdesc}
                  onChange={(e) => setKdesc(e.target.value)}
                  placeholder="which agent / machine uses this key?"
                  maxLength={200}
                  className="w-full font-mono text-[12px] tracking-[0.06em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
                />
              </div>
              <FoldButton size="sm" className="w-full" disabled={busy || !kname.trim()}>
                {busy ? "MINTING…" : "＋ MINT MASTER KEY"}
              </FoldButton>
            </form>

            {error && (
              <div className="font-mono text-[10px] tracking-[0.1em] text-danger border border-danger/40 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <AnimatePresence>
              {fresh && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <KeyReveal apiKey={fresh.key} label="MASTER KEY" />
                  <div className="font-mono text-[9px] tracking-[0.14em] text-inkdim mt-2">
                    {fresh.name} · VIEWABLE ANYTIME FROM THE LIST BELOW · KEEP OUT OF CHATS — USE AN ENV VAR
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          <Section tag="KEY REGISTRY" title={`${keys ? keys.length : "…"} key${keys?.length === 1 ? "" : "s"} registered`}>
            {keys === null ? (
              <Loader compact label="READING REGISTRY" />
            ) : keys.length === 0 ? (
              <div className="font-mono text-[10px] tracking-[0.16em] text-inkdim">NO MASTER KEYS YET — MINT ONE ABOVE</div>
            ) : (
              <ul className="space-y-3">
                {keys.map((k) => (
                  <li key={k.key_id} className="border border-line rounded-lg p-3 bg-panel/60">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" aria-hidden />
                      <span className="font-mono text-[11.5px] tracking-[0.08em] text-ink truncate">{k.name}</span>
                      <span className="ml-auto font-mono text-[8.5px] tracking-[0.12em] text-inkdim shrink-0">
                        {istDate(k.created_at)}
                      </span>
                    </div>
                    {k.description && (
                      <div className="font-mono text-[9.5px] tracking-[0.08em] text-inkdim mt-1 truncate">{k.description}</div>
                    )}
                    <div className="font-mono text-[8.5px] tracking-[0.1em] text-inkdim/70 mt-0.5">{k.key_id}</div>
                    <div className="flex items-center gap-2 mt-2">
                      {revealed[k.key_id] ? (
                        <>
                          <code className="flex-1 min-w-0 truncate font-mono text-[10px] tracking-[0.04em] text-gold bg-panel2 border border-gold/30 rounded-md px-2 py-1.5">
                            {revealed[k.key_id]}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyKey(k.key_id)}
                            aria-label="Copy key"
                            className="p-1.5 rounded-md text-inkdim hover:text-gold hover:bg-panel2"
                          >
                            {copied === k.key_id ? <Check className="w-3.5 h-3.5 text-gold" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => viewKey(k.key_id)}
                          className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.16em] px-3 py-1.5 rounded-md border border-line bg-panel2 text-ink hover:border-gold/60 hover:text-gold transition-colors"
                        >
                          <Eye className="w-3 h-3" /> VIEW KEY
                        </button>
                      )}
                      <FoldButton variant="danger" size="sm" className="ml-auto" onClick={() => setConfirmId(k.key_id)}>
                        <Trash2 className="w-3 h-3" /> DELETE
                      </FoldButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* ── right: operating manual ───────────────────────────────────────── */}
        <div className="space-y-5">
          <Section tag="ENDPOINT" title="One URL · every agent">
            <CopyRow label="URL" value={ENDPOINT} />
            <p>
              Connect any MCP-capable agent to this URL with a master key as <code className="text-ink">Authorization: Bearer</code>.
            </p>
          </Section>

          <Section tag="CONNECT RECIPES" title="Per-agent setup">
            <div className="font-mono text-[9px] tracking-[0.16em] text-gold mt-1">CURSOR</div>
            <pre className="font-mono text-[10px] leading-relaxed text-ink bg-panel2 border border-line rounded-lg p-3 overflow-x-auto">{`// .cursor/mcp.json
{ "mcpServers": {
  "rodex": {
    "url": "${ENDPOINT}",
    "headers": { "Authorization": "Bearer \${env:RODEX_MCP_KEY}" }
  }
} }`}</pre>
            <div className="font-mono text-[9px] tracking-[0.16em] text-gold mt-2">CLAUDE CODE / CLI AGENTS</div>
            <pre className="font-mono text-[10px] leading-relaxed text-ink bg-panel2 border border-line rounded-lg p-3 overflow-x-auto">{`export RODEX_MCP_KEY=rok_mcp_…
claude mcp add --transport http rodex ${ENDPOINT} \\
  --header "Authorization: Bearer $RODEX_MCP_KEY"`}</pre>
            <div className="font-mono text-[9px] tracking-[0.16em] text-gold mt-2">STDIO-ONLY CLIENTS (CLAUDE DESKTOP, …)</div>
            <pre className="font-mono text-[10px] leading-relaxed text-ink bg-panel2 border border-line rounded-lg p-3 overflow-x-auto">{`npx mcp-remote ${ENDPOINT} \\
  --header "Authorization: Bearer $RODEX_MCP_KEY"`}</pre>
            <p>Never paste the key into a chat — reference <code className="text-ink">{"${env:RODEX_MCP_KEY}"}</code> instead.</p>
          </Section>

          <Section tag="THE CONFIRMATION PROTOCOL" title="Agent rules — copy into your agent prompt if needed">
            <pre className="font-mono text-[10px] leading-relaxed text-ink bg-panel2 border border-line rounded-lg p-3 overflow-x-auto">{`You may operate the RodeX database via MCP.
1. CONFIRM EVERY MUTATION: create/update/delete tools
   require confirmed:true — NEVER send it without the
   user's explicit approval.
2. GATHER BEFORE ACTING: collect all values from the
   user, present the full plan, get one approval, then
   execute step by step.
3. NEVER guess app/table names — list_apps and
   list_tables first.
4. Reads are free: explore before proposing changes.`}</pre>
          </Section>

          <Section tag="TOOL REFERENCE" title="18 tools — reads free, mutations confirmed">
            <ul className="grid grid-cols-1 gap-1.5">
              {[
                ["health · get_instructions", "read"],
                ["list_apps · get_app · list_tables", "read"],
                ["get_item · query", "read"],
                ["create_app · delete_app · suspend · resume", "confirm"],
                ["recover_app · force_delete_app", "confirm"],
                ["create_table · delete_table", "confirm"],
                ["put_item · update_item · delete_item", "confirm"],
              ].map(([t, kind]) => (
                <li key={t} className="flex items-center gap-2 font-mono text-[10px] tracking-[0.06em]">
                  <span className="text-ink">{t}</span>
                  <span className={`ml-auto text-[8.5px] tracking-[0.14em] px-1.5 py-0.5 rounded ${kind === "confirm" ? "text-amber bg-amber/10 border border-amber/30" : "text-inkdim bg-panel2 border border-line"}`}>
                    {kind === "confirm" ? "MUTATION — CONFIRM" : "READ"}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Every mutation without <code className="text-ink">confirmed: true</code> is refused with a{" "}
              <code className="text-ink">confirmation_required</code> response — nothing executes without you.
            </p>
          </Section>

          <Section tag="BUDGETS & ERRORS" title="The honest numbers">
            <ul className="space-y-1.5">
              <li>MCP surface: <span className="text-ink">600 total / 120 writes / 240 reads</span> per minute, platform-wide</li>
              <li>App budgets still apply to MCP traffic (they share the same tables)</li>
              <li><code className="text-ink">401</code> — missing/invalid master key · <code className="text-ink">429</code> — budget spent, names the budget + retry seconds</li>
              <li><code className="text-ink">confirmation_required</code> — the gate: agent must ask you first</li>
              <li>Items ≤ 20 KB · query limit ≤ 100 · updates are version-guarded (409 on conflict)</li>
            </ul>
          </Section>

          <Section tag="FAQ" title="Questions, answered">
            <ul className="space-y-2">
              <li><span className="text-ink">Key lost or leaked?</span> View it here anytime; if compromised, delete it instantly and mint a new one.</li>
              <li><span className="text-ink">Agent misbehaving?</span> Delete its key — every request is re-checked against the registry.</li>
              <li><span className="text-ink">Why no rotation?</span> Delete + recreate is the flow; rotation would complicate the key registry for no gain.</li>
              <li><span className="text-ink">Who can use a master key?</span> Anyone holding it — treat it like the platform password.</li>
            </ul>
          </Section>
        </div>
      </motion.div>

      {/* ── delete confirmation modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {confirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setConfirmId(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="nameplate w-full max-w-sm p-6"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Delete master key"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="font-mono text-[10px] tracking-[0.22em] text-danger">DESTROY MASTER KEY</div>
                <button type="button" onClick={() => setConfirmId(null)} className="text-inkdim hover:text-ink" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[12px] leading-relaxed text-inkdim mb-5">
                Every agent using this key loses access <em>immediately</em>. There is no rotation and no undo — mint a new
                key to replace it.
              </p>
              <div className="flex gap-2">
                <FoldButton type="button" variant="ghost" size="sm" className="flex-1" onClick={() => setConfirmId(null)}>
                  KEEP IT
                </FoldButton>
                <FoldButton type="button" variant="danger" size="sm" className="flex-1" disabled={busy} onClick={deleteKey}>
                  {busy ? "DESTROYING…" : "DESTROY"}
                </FoldButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
