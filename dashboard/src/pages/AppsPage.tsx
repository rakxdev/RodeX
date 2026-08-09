import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api, ApiError, type AppInfo, type AppStatus } from "@/api/client";

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
      setApps(await api.get<{ apps: AppInfo[] }>("/v1/admin/apps").then((r) => r.apps));
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
      setFresh(app); // key shown once → sealed reveal
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-mono text-2xl tracking-[0.05em]">
            APP <span className="text-gold">BOARD</span>
          </h1>
          <div className="font-mono text-[11px] tracking-[0.16em] text-inkdim mt-1">INSTRUMENTS REGISTERED · {apps ? apps.length : "…"}</div>
        </div>
        <form onSubmit={create} className="flex gap-2 items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="app name (e.g. weather-bot)"
            className="font-mono text-[12px] tracking-[0.06em] px-3 py-2.5 rounded-lg bg-panel2 border border-line text-ink placeholder:text-inkdim focus:outline-none focus:border-gold w-56"
          />
          <button disabled={busy || !name.trim()} className="action-red px-5 py-2.5 rounded-lg text-[12px]">
            ＋ Fabricate
          </button>
        </form>
      </div>

      {error && <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-redx">{error}</div>}

      <AnimatePresence>
        {fresh && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="nameplate p-5 mb-6 border-gold/50"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[10px] tracking-[0.22em] text-gold">SEAL BROKEN — API KEY SHOWN ONCE</div>
              <button onClick={() => setFresh(null)} className="font-mono text-[10px] tracking-[0.2em] text-inkdim hover:text-ink">
                DISMISS
              </button>
            </div>
            <div className="font-mono text-[13px] tracking-[0.04em] break-all text-paper">{fresh.api_key}</div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-inkdim mt-2">
              X-App-Id: {fresh.app_id} · KEY PREFIX {fresh.key_prefix}…
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps?.map((app, i) => (
          <motion.div
            key={app.app_id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link to={`/apps/${app.app_id}`} className="block">
              <div className="nameplate p-4 hover:border-gold/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-mono text-[14px] tracking-[0.04em]">{app.name}</h3>
                  <span className="ml-auto">{statusStamp(app.status)}</span>
                </div>
                <div className="serial">S/N {app.app_id}</div>
                <div className="foldline my-3" />
                <div className="flex justify-between font-mono text-[10.5px] text-inkdim">
                  <span>
                    KEY <b className="text-ink font-medium">{app.key_prefix}…</b>
                  </span>
                  <span>
                    TABLES <b className="text-ink font-medium">{app.tables.length}</b>
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
        {apps && apps.length === 0 && (
          <div className="col-span-full nameplate p-10 text-center font-mono text-[12px] tracking-[0.14em] text-inkdim">
            NO INSTRUMENTS REGISTERED — FABRICATE YOUR FIRST APP
          </div>
        )}
      </div>
    </div>
  );
}
