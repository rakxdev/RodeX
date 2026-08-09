import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api, ApiError, type AppInfo } from "@/api/client";
import { pageTransition, foldIn, stagger } from "@/lib/motion";
import KeyReveal from "@/components/KeyReveal";
import { FoldButton } from "@/components/FoldButton";

export default function AppDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [arm, setArm] = useState<"delete" | "purge" | null>(null);

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

  async function act(action: string, body?: unknown) {
    if (!id) return;
    setBusy(action);
    setError(null);
    try {
      const result = await api.post<AppInfo & { api_key?: string }>(`/v1/admin/apps/${id}/${action}`, body);
      if (action === "rotate-key" && result.api_key) setNewKey(result.api_key);
      setApp(result);
      setArm(null);
      if (action === "force-delete") navigate("/apps");
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
      <motion.div {...pageTransition} className="font-mono text-[12px] tracking-[0.14em] text-inkdim animate-pulse">
        LOADING INSTRUMENT…
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
      <Link to="/apps" className="font-mono text-[11px] tracking-[0.14em] text-inkdim hover:text-ink">
        ← APP BOARD
      </Link>
      <div className="flex flex-wrap items-center gap-3 mt-3 mb-6">
        <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em]">{app.name}</h1>
        <span className={`stamp ${deleting ? "stamp-deleting" : suspended ? "stamp-suspended" : "stamp-active"}`}>
          {app.status}
        </span>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 font-mono text-[11px] tracking-[0.08em] text-redx">
          {error}
        </motion.div>
      )}

      {/* actions strip */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 mb-6">
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
        {app.purge_at && (
          <span className="font-mono text-[10px] tracking-[0.14em] text-redx">
            PURGE AT {new Date(app.purge_at * 1000).toISOString().slice(0, 16)}
          </span>
        )}
      </motion.div>

      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={foldIn} className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 01</b> · OVERVIEW
          </h4>
          <dl className="space-y-2 font-mono text-[12px] break-all">
            <div className="flex justify-between gap-3"><dt className="text-inkdim shrink-0">app_id</dt><dd>{app.app_id}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-inkdim shrink-0">created</dt><dd>{new Date(app.created_at * 1000).toISOString().slice(0, 10)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-inkdim shrink-0">status</dt><dd className="uppercase">{app.status}</dd></div>
          </dl>
        </motion.div>

        <motion.div variants={foldIn} className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 02</b> · CREDENTIALS
          </h4>
          {newKey ? (
            <KeyReveal apiKey={newKey} label="NEW API KEY" />
          ) : (
            <dl className="space-y-2 font-mono text-[12px]">
              <div className="flex justify-between"><dt className="text-inkdim">key_prefix</dt><dd>{app.key_prefix}…</dd></div>
              <div className="flex justify-between"><dt className="text-inkdim">api_key</dt><dd className="text-gold">gold-sealed · rotate to reveal</dd></div>
            </dl>
          )}
        </motion.div>

        <motion.div variants={foldIn} className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 03</b> · TABLES
          </h4>
          {app.tables.length === 0 ? (
            <div className="font-mono text-[11px] tracking-[0.1em] text-inkdim">NO TABLES — CREATE VIA API (SEE DOCS)</div>
          ) : (
            <ul className="space-y-2 font-mono text-[12px] break-all">
              {app.tables.map((t) => (
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
