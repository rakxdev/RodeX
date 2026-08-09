import { motion } from "framer-motion";
import { pageTransition, foldIn, stagger } from "@/lib/motion";

export default function DocsPage() {
  const sections = [
    { cell: "01", title: "AUTHENTICATION", body: "Send X-App-Id and X-Api-Key headers on every request. Keys are shown once at creation; rotate from the app board if leaked. Suspended or deleting apps return 403." },
    { cell: "02", title: "WRITE A ROW", body: "POST /v1/item/put with { table, item: { pk, sk?, ... } }. Optional overwrite:true replaces an existing row; a duplicate without it returns 409. Add request_id for idempotent retries (24h)." },
    { cell: "03", title: "READ & QUERY", body: "POST /v1/item/get for one row (404 when missing). POST /v1/query with pk, optional sk_prefix, limit (max 100) — paginate with next_start_key." },
    { cell: "04", title: "UPDATE & DELETE", body: "POST /v1/item/update replaces the data payload; pass expected_version to guard against conflicts (409 on mismatch). POST /v1/item/delete removes a row." },
    { cell: "05", title: "TABLES", body: "POST /v1/table/create registers a table; physical names are app_<app_id>_<name> — no app can touch another's tables (403)." },
    { cell: "06", title: "LIMITS & ERRORS", body: "Items ≤ 20 KB (413). Per-app: 600 req/min, 120 writes, 240 reads (429). Errors: 400, 401, 403, 404, 409, 413, 415, 429, 502/503. Full contract: docs/openapi.yaml." },
  ];

  return (
    <motion.div {...pageTransition}>
      <h1 className="font-mono text-xl sm:text-2xl tracking-[0.05em] mb-2">
        API <span className="text-gold">REFERENCE</span>
      </h1>
      <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-inkdim mb-6">ONE CONTRACT · EVERY APP · DOCS/OPENAPI.YAML</div>
      <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((s) => (
          <motion.div key={s.cell} variants={foldIn} className="sheet-panel p-5">
            <h4 className="mb-3">
              <b>CELL {s.cell}</b> · {s.title}
            </h4>
            <p className="font-mono text-[12px] leading-relaxed text-inkdim">{s.body}</p>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
