import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Search, X } from "lucide-react";
import { api, ApiError, gatewayBase, type AppInfo, type AppStatus } from "@/api/client";
import { pageTransition, fadeUp, stagger, springLift } from "@/lib/motion";
import KeyReveal from "@/components/KeyReveal";
import Loader from "@/components/Loader";
import { FoldButton } from "@/components/FoldButton";

function CopyCell({ value, label }: { value: string; label: string }) {
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
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 font-mono text-[9.5px] tracking-[0.12em] text-inkdim hover:text-ink transition-colors"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

function statusStamp(status: AppStatus) {
  switch (status) {
    case "active":
      return <span className="stamp stamp-active">Active</span>;
    case "suspended":
      return <span className="stamp stamp-suspended">Suspended</span>;
    case "deleting":
      return <span className="stamp stamp-deleting">Deleting</span>;
  }
}

/** FABRICATE dialog — name + optional note. */
function FabricateModal({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (name: string, description?: string) => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setName("");
      setNote("");
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    onCreate(name.trim(), note.trim() || undefined);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4"
          onClick={onClose}
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
            aria-label="Fabricate a new app"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="font-mono text-[10px] tracking-[0.22em] text-gold">FABRICATE NEW INSTRUMENT</div>
              <button type="button" onClick={onClose} className="text-inkdim hover:text-ink" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="fab-name" className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim block mb-1.5">
                  APP NAME
                </label>
                <input
                  id="fab-name"
                  name="app-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. weather-bot"
                  autoFocus
                  className="w-full font-mono text-[12px] tracking-[0.06em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
                />
                <div className="font-mono text-[8.5px] tracking-[0.12em] text-inkdim mt-1">
                  {"^[a-z0-9][a-z0-9_-]{0,39}$ · LOWERCASE, DASHES, UNDERSCORES"}
                </div>
              </div>
              <div>
                <label htmlFor="fab-note" className="font-mono text-[9.5px] tracking-[0.2em] text-inkdim block mb-1.5">
                  NOTE <span className="text-inkdim/60">(OPTIONAL · ≤200 CHARS)</span>
                </label>
                <input
                  id="fab-note"
                  name="app-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="what is this app for?"
                  maxLength={200}
                  className="w-full font-mono text-[12px] tracking-[0.06em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <FoldButton type="button" variant="ghost" size="sm" className="flex-1" onClick={onClose}>
                  CANCEL
                </FoldButton>
                <FoldButton size="sm" className="flex-1" disabled={busy || !name.trim()}>
                  {busy ? "FABRICATING…" : "＋ FABRICATE"}
                </FoldButton>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function AppsPage() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [query, setQuery] = useState("");
  const [fabOpen, setFabOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<AppInfo | null>(null);

  async function load() {
    try {
      const r = await api.get<{ apps: AppInfo[] }>("/v1/admin/apps");
      setApps((r.apps ?? []).filter((a) => a && typeof a === "object"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load apps");
      setApps([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    if (!apps) return null;
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.app_id.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q),
    );
  }, [apps, query]);

  async function create(name: string, description?: string) {
    setBusy(true);
    setError(null);
    try {
      const app = await api.post<AppInfo>("/v1/admin/apps", { name, description });
      setFresh(app);
      setFabOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div {...pageTransition}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em]">
            APP <span className="text-gold">BOARD</span>
          </h1>
          <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mt-1">
            INSTRUMENTS REGISTERED · {apps ? apps.length : "…"}
          </div>
        </div>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-inkdim" aria-hidden="true" />
            <input
              id="app-search"
              name="app-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search apps…"
              aria-label="Search apps"
              className="w-full sm:w-52 font-mono text-[11px] tracking-[0.06em] pl-9 pr-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold"
            />
          </div>
          <FoldButton size="sm" className="shrink-0" onClick={() => setFabOpen(true)}>
            ＋ Fabricate
          </FoldButton>
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 font-mono text-[11px] tracking-[0.08em] text-redx">
          {error}
        </motion.div>
      )}

      <FabricateModal open={fabOpen} busy={busy} onClose={() => setFabOpen(false)} onCreate={create} />

      <AnimatePresence>
        {fresh && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="nameplate p-5 mb-6 border-gold/50"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[10px] tracking-[0.22em] text-gold">
                NEW INSTRUMENT FABRICATED — {fresh.name}
              </div>
              <button onClick={() => setFresh(null)} className="font-mono text-[10px] tracking-[0.2em] text-inkdim hover:text-ink">
                DISMISS
              </button>
            </div>

            {/* credentials — both halves of the key pair, copyable */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1 bg-panel2 border border-line rounded-lg px-3 py-2.5">
                <div className="font-mono text-[9px] tracking-[0.2em] text-inkdim mb-1">X-APP-ID</div>
                <div className="flex items-center gap-2 font-mono text-[12px] break-all">
                  <span className="text-ink">{fresh.app_id}</span>
                  <CopyCell value={fresh.app_id} label="app id" />
                </div>
              </div>
              <div className="flex-1 bg-panel2 border border-line rounded-lg px-3 py-2.5">
                <div className="font-mono text-[9px] tracking-[0.2em] text-inkdim mb-1">KEY PREFIX</div>
                <div className="font-mono text-[12px] text-ink">{fresh.key_prefix}…</div>
              </div>
            </div>

            <KeyReveal apiKey={fresh.api_key ?? ""} label="API KEY" />

            <div className="mt-4">
              <div className="font-mono text-[9px] tracking-[0.2em] text-inkdim mb-2">CONNECT — FIRST WRITE</div>
              <pre className="code-block whitespace-pre overflow-x-auto">
                <code>
                  <span className="cmt"># both credentials are needed, every request</span>{"\n"}
                  <span className="cmt"># X-App-Id: {fresh.app_id}</span>{"\n"}
                  <span className="cmt"># X-Api-Key: the key above (copy before leaving)</span>{"\n"}
                  {`curl -X POST ${gatewayBase}/v1/item/put \\\\`}{"\n"}
                  {`  -H "X-App-Id: ${fresh.app_id}" \\\\`}{"\n"}
                  {`  -H "X-Api-Key: YOUR_KEY" \\\\`}{"\n"}
                  {`  -d '{"table":"t","item":{"pk":"K#1"}}'`}
                </code>
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        variants={stagger(0.05)}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start"
      >
        {apps === null && (
          <div className="col-span-full">
            <Loader label="FETCHING BOARD" />
          </div>
        )}
        {(visible ?? []).map((app) => (
          <motion.div key={app.app_id} variants={fadeUp}>
            <Link to={`/apps/${app.app_id}`} className="block">
              <motion.div whileHover={{ y: -3 }} transition={springLift} className="nameplate p-4 hover:border-gold/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-mono text-[14px] tracking-[0.04em] truncate">{app.name}</h3>
                  <span className="ml-auto shrink-0">{statusStamp(app.status)}</span>
                </div>
                {app.description && (
                  <div className="font-mono text-[10.5px] leading-relaxed text-inkdim mb-2 line-clamp-2">{app.description}</div>
                )}
                <div className="serial truncate">S/N {app.app_id}</div>
                <div className="foldline my-3" />
                <div className="flex justify-between font-mono text-[10.5px] text-inkdim">
                  <span>
                    KEY <b className="text-ink font-medium">{app.key_prefix}…</b>
                  </span>
                  <span>
                    TABLES <b className="text-ink font-medium">{(app.tables ?? []).length}</b>
                  </span>
                </div>
              </motion.div>
            </Link>
          </motion.div>
        ))}
        {apps && (visible ?? []).length === 0 && (
          <motion.div variants={fadeUp} className="col-span-full">
            <div className="nameplate p-10 text-center">
              <div className="font-mono text-[12px] tracking-[0.14em] text-inkdim">
                {query.trim()
                  ? `NO MATCHES FOR “${query.trim()}”`
                  : "NO INSTRUMENTS REGISTERED — FABRICATE YOUR FIRST APP"}
              </div>
              <div className="mt-3">
                <button
                  onClick={() => (query.trim() ? setQuery("") : setFabOpen(true))}
                  className="font-mono text-[10px] tracking-[0.18em] text-gold hover:underline underline-offset-4"
                >
                  {query.trim() ? "CLEAR SEARCH" : "FABRICATE ONE"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}