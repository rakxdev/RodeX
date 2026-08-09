import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type AppInfo } from "@/api/client";

export default function AppDetailPage() {
  const { id } = useParams();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<AppInfo>(`/v1/admin/apps/${id}`)
      .then(setApp)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load app"));
  }, [id]);

  if (error) {
    return (
      <div className="font-mono text-[12px] tracking-[0.08em] text-redx">
        {error} — <Link to="/apps" className="text-gold underline">back to board</Link>
      </div>
    );
  }
  if (!app) return <div className="font-mono text-[12px] tracking-[0.14em] text-inkdim">LOADING INSTRUMENT…</div>;

  return (
    <div>
      <Link to="/apps" className="font-mono text-[11px] tracking-[0.14em] text-inkdim hover:text-ink">
        ← APP BOARD
      </Link>
      <div className="flex items-center gap-3 mt-3 mb-6">
        <h1 className="font-mono text-2xl tracking-[0.05em]">{app.name}</h1>
        <span className={`stamp ${app.status === "active" ? "stamp-active" : app.status === "suspended" ? "stamp-suspended" : "stamp-deleting"}`}>
          {app.status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CELL 01 — overview */}
        <div className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 01</b> · OVERVIEW
          </h4>
          <dl className="space-y-2 font-mono text-[12px]">
            <div className="flex justify-between"><dt className="text-inkdim">app_id</dt><dd>{app.app_id}</dd></div>
            <div className="flex justify-between"><dt className="text-inkdim">created</dt><dd>{new Date(app.created_at * 1000).toISOString().slice(0, 10)}</dd></div>
            <div className="flex justify-between"><dt className="text-inkdim">status</dt><dd className="uppercase">{app.status}</dd></div>
            {app.purge_at && (
              <div className="flex justify-between"><dt className="text-redx">purge_at</dt><dd className="text-redx">{new Date(app.purge_at * 1000).toISOString().slice(0, 16)}</dd></div>
            )}
          </dl>
        </div>

        {/* CELL 02 — credentials */}
        <div className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 02</b> · CREDENTIALS
          </h4>
          <dl className="space-y-2 font-mono text-[12px]">
            <div className="flex justify-between"><dt className="text-inkdim">key_prefix</dt><dd>{app.key_prefix}…</dd></div>
            <div className="flex justify-between"><dt className="text-inkdim">api_key</dt><dd className="text-gold">gold-sealed · rotate to reveal</dd></div>
          </dl>
        </div>

        {/* CELL 03 — tables */}
        <div className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 03</b> · TABLES
          </h4>
          {app.tables.length === 0 ? (
            <div className="font-mono text-[11px] tracking-[0.1em] text-inkdim">NO TABLES — CREATE VIA API OR DOCS</div>
          ) : (
            <ul className="space-y-2 font-mono text-[12px]">
              {app.tables.map((t) => (
                <li key={t} className="flex justify-between">
                  <span>{t}</span>
                  <span className="text-inkdim">app_{app.app_id}_{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* CELL 04 — quick start */}
        <div className="sheet-panel p-5">
          <h4 className="mb-4">
            <b>CELL 04</b> · QUICK START
          </h4>
          <pre className="font-mono text-[10.5px] leading-relaxed text-inkdim overflow-x-auto whitespace-pre">
{`# write a row
curl -X POST /v1/item/put \\
  -H "X-App-Id: ${app.app_id}" \\
  -H "X-Api-Key: YOUR_KEY" \\
  -d '{"table":"users","item":{"pk":"U#1"}}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}
