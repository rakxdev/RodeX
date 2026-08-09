import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { api, ApiError, type AppInfo } from "@/api/client";
import { pageTransition, foldIn, stagger } from "@/lib/motion";
import { istDate } from "@/lib/utils";
import KeyReveal from "@/components/KeyReveal";
import ViewKey from "@/components/ViewKey";
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
      className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-inkdim hover:text-ink transition-colors"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
      {copied ? "COPIED" : label}
    </button>
  );
}

export default function AppDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [arm, setArm] = useState<"delete" | "purge" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    try {
      setApp(await api.get<AppInfo>(`/v1/admin/apps/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load app");
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  // auto-dismiss the rotate toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function act(action: string, body?: unknown) {
    if (!id) return;
    setBusy(action);
    setError(null);
    try {
      let result: AppInfo & { api_key?: string };
      if (action === "delete") {
        // soft delete is an HTTP DELETE on the app resource
        result = await api.delete<AppInfo>(`/v1/admin/apps/${id}`);
      } else {
        result = await api.post<AppInfo & { api_key?: string }>(`/v1/admin/apps/${id}/${action}`, body);
      }
      if (action === "rotate-key") {
        if (result.api_key) setNewKey(result.api_key);
        setToast("OLD KEY INVALIDATED — NEW KEY ISSUED");
        // the rotate response carries the full app; re-fetch if anything is missing
        if (result.app_id) setApp(result);
        else await load();
      } else if (action === "force-delete") {
        // do NOT re-render the detail page with the purge response — leave it
        setToast("APP PURGED PERMANENTLY");
        navigate("/apps");
      } else {
        setApp(result);
      }
      setArm(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (error && !app) {
    return (
      <motion.div {...pageTransition} className="font-mono text-[12px] tracking-[0.08em] text-redx">
        {error} — <Link to="/apps" className="text-gold underline">back to board</Link>
      </motion.div>
    );
  }
  if (!app) {
    return (
      <motion.div {...pageTransition}>
        <Loader label="LOADING INSTRUMENT" />
      </motion.div>
    );
  }

  const deleting = app.status === "deleting";
  const suspended = app.status === "suspended";
  const actionBtn = (key: string, label: string, onClick: () => void, danger = false) => (
    <FoldButton
      disabled={busy !== null}
      onClick={onClick}
      variant={danger ? "danger" : "ghost"}
      size="sm"
    >
      {busy === key ? "…" : label}
    </FoldButton>
  );

  return (
    <motion.div {...pageTransition}>
      {/* pinned control head: back link, title, stamp, actions, explainer */}
      <div className="sticky top-[53px] z-30 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 border-b border-line bg-bg/90 backdrop-blur mb-6">
        <Link to="/apps" className="font-mono text-[11px] tracking-[0.14em] text-inkdim hover:text-ink">
          ← APP BOARD
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <h1 className="font-mono text-lg sm:text-xl tracking-[0.05em]">{app.name}</h1>
          <span className={`stamp ${deleting ? "stamp-deleting" : suspended ? "stamp-suspended" : "stamp-active"}`}>
            {app.status}
          </span>
          {app.purge_at !== undefined && (
            <span className="font-mono text-[10px] tracking-[0.14em] text-redx">
              PURGE AT {istDate(app.purge_at)} IST
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {deleting ? (
            <>
              {actionBtn("recover", "RECOVER", () => act("recover"))}
              {arm === "purge" ? (
                <FoldButton onClick={() => act("force-delete")} variant="red" size="sm">
                  CONFIRM PURGE — IRREVERSIBLE
                </FoldButton>
              ) : (
                actionBtn("arm-purge", "PURGE NOW", () => setArm("purge"), true)
              )}
            </>
          ) : (
            <>
              {actionBtn(suspended ? "resume" : "suspend", suspended ? "RESUME" : "SUSPEND", () => act(suspended ? "resume" : "suspend"))}
              {actionBtn("rotate-key", "ROTATE KEY", () => act("rotate-key"))}
              {arm === "delete" ? (
                <FoldButton onClick={() => act("delete")} variant="red" size="sm">
                  CONFIRM DELETE — 5 MIN WINDOW
                </FoldButton>
              ) : (
                actionBtn("arm-delete", "DELETE", () => setArm("delete"), true)
              )}
            </>
          )}
        </div>
        <div className="mt-2 font-mono text-[9px] sm:text-[9.5px] tracking-[0.12em] text-inkdim leading-relaxed">
          SUSPEND <span className="text-ink/70">→ traffic replies 403</span> · RESUME{" "}
          <span className="text-ink/70">→ traffic restored</span> · DELETE <span className="text-ink/70">→ 5-min recovery window</span> ·
          ROTATE KEY <span className="text-ink/70">→ old key dies instantly</span>
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 font-mono text-[11px] tracking-[0.08em] text-redx">
          {error}
        </motion.div>
      )}

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-amberx border border-amberx/40 bg-amberx/5 px-3 py-2 rounded-md"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amberx inline-block" aria-hidden="true" />
          {toast}
        </motion.div>
      )}

      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <motion.div variants={foldIn} className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 01</b> · OVERVIEW
          </h4>
          <dl className="space-y-2 font-mono text-[12px] break-all">
            <div className="flex justify-between gap-3"><dt className="text-inkdim shrink-0">app_id</dt><dd className="flex items-center gap-2"><span className="truncate">{app.app_id}</span><CopyCell value={app.app_id} label="COPY" /></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-inkdim shrink-0">created</dt><dd>{istDate(app.created_at)} IST</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-inkdim shrink-0">status</dt><dd className="uppercase">{app.status}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-inkdim shrink-0">storage</dt><dd>NO PER-APP CAP · 25 GB ACCOUNT WIDE</dd></div>
            {app.description && (
              <div className="flex justify-between gap-3"><dt className="text-inkdim shrink-0">note</dt><dd className="text-inkdim">{app.description}</dd></div>
            )}
          </dl>
        </motion.div>

        <motion.div variants={foldIn} className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 02</b> · CREDENTIALS
          </h4>
          {newKey ? (
            <KeyReveal key={newKey} apiKey={newKey} label="NEW API KEY" />
          ) : (
            <div>
              <dl className="space-y-2 font-mono text-[12px] mb-4">
                <div className="flex justify-between"><dt className="text-inkdim">key_prefix</dt><dd>{app.key_prefix}…</dd></div>
              </dl>
              <ViewKey appId={app.app_id} recoverableUntil={app.key_recoverable_until} />
            </div>
          )}
        </motion.div>

        <motion.div variants={foldIn} className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 03</b> · TABLES
          </h4>
          {(app.tables ?? []).length === 0 ? (
            <div className="font-mono text-[11px] tracking-[0.1em] text-inkdim">NO TABLES — CREATE VIA API (SEE DOCS)</div>
          ) : (
            <ul className="space-y-2 font-mono text-[12px] break-all">
              {(app.tables ?? []).map((t) => (
                <li key={t} className="flex justify-between gap-3">
                  <span className="shrink-0">{t}</span>
                  <span className="text-inkdim">app_{app.app_id}_{t}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        <motion.div variants={foldIn} className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 04</b> · QUICK START
          </h4>
          <pre className="font-mono text-[10px] sm:text-[10.5px] leading-relaxed text-inkdim overflow-x-auto whitespace-pre">
{`# write a row
curl -X POST /v1/item/put \\
  -H "X-App-Id: ${app.app_id}" \\
  -H "X-Api-Key: YOUR_KEY" \\
  -d '{"table":"users","item":{"pk":"U#1"}}'`}
          </pre>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
