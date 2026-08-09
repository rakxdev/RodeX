import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { api, ApiError, type AppInfo, type AppStatus } from "@/api/client";
import { pageTransition, fadeUp, stagger, springLift } from "@/lib/motion";
import KeyReveal from "@/components/KeyReveal";
import { FoldButton } from "@/components/FoldButton";

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

export default function AppsPage() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<AppInfo | null>(null);

  async function load() {
    try {
      const r = await api.get<{ apps: AppInfo[] }>("/v1/admin/apps");
      setApps(r.apps);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load apps");
      setApps([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const app = await api.post<AppInfo>("/v1/admin/apps", { name: name.trim() });
      setFresh(app);
      setName("");
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
        <form onSubmit={create} className="flex gap-2 items-center w-full sm:w-auto">
          <input
            id="app-name"
            name="app-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="app name (e.g. weather-bot)"
            className="flex-1 sm:flex-none font-mono text-[12px] tracking-[0.06em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold sm:w-56"
          />
          <FoldButton size="sm" className="shrink-0" disabled={busy || !name.trim()}>
            ＋ Fabricate
          </FoldButton>
        </form>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 font-mono text-[11px] tracking-[0.08em] text-redx">
          {error}
        </motion.div>
      )}

      <AnimatePresence>
        {fresh && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="nameplate p-5 mb-6 border-gold/50"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[10px] tracking-[0.22em] text-gold">
                NEW INSTRUMENT FABRICATED — {fresh.name}
              </div>
              <button onClick={() => setFresh(null)} className="font-mono text-[10px] tracking-[0.2em] text-inkdim hover:text-ink">
                DISMISS
              </button>
            </div>
            <KeyReveal apiKey={fresh.api_key ?? ""} label="API KEY" />
            <div className="font-mono text-[10px] tracking-[0.14em] text-inkdim mt-3">
              X-App-Id: {fresh.app_id} · KEY PREFIX {fresh.key_prefix}…
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        variants={stagger(0.05)}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {apps?.map((app) => (
          <motion.div key={app.app_id} variants={fadeUp}>
            <Link to={`/apps/${app.app_id}`} className="block">
              <motion.div whileHover={{ y: -3 }} transition={springLift} className="nameplate p-4 hover:border-gold/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-mono text-[14px] tracking-[0.04em] truncate">{app.name}</h3>
                  <span className="ml-auto shrink-0">{statusStamp(app.status)}</span>
                </div>
                <div className="serial truncate">S/N {app.app_id}</div>
                <div className="foldline my-3" />
                <div className="flex justify-between font-mono text-[10.5px] text-inkdim">
                  <span>
                    KEY <b className="text-ink font-medium">{app.key_prefix}…</b>
                  </span>
                  <span>
                    TABLES <b className="text-ink font-medium">{app.tables.length}</b>
                  </span>
                </div>
              </motion.div>
            </Link>
          </motion.div>
        ))}
        {apps && apps.length === 0 && (
          <motion.div variants={fadeUp} className="col-span-full">
            <div className="nameplate p-10 text-center">
              <div className="font-mono text-[12px] tracking-[0.14em] text-inkdim">
                NO INSTRUMENTS REGISTERED — FABRICATE YOUR FIRST APP
              </div>
              <div className="mt-3">
                <button
                  onClick={() => document.getElementById("app-name")?.focus()}
                  className="font-mono text-[10px] tracking-[0.18em] text-gold hover:underline underline-offset-4"
                >
                  CREATE ONE ABOVE ↑
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
