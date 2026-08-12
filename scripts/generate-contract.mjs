#!/usr/bin/env node
/**
 * generate-contract.mjs — deterministic generator for the RodeX public
 * contract. Produces typed modules for gateway + dashboard, Markdown
 * reference tables, and updates marked regions in README.md / openapi.yaml.
 *
 * Usage:
 *   node scripts/generate-contract.mjs          # write outputs
 *   node scripts/generate-contract.mjs --check  # verify outputs are fresh (CI)
 *
 * Determinism: stable ordering, no timestamps, no locale-dependent output.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateContract, loadContract, CONTRACT_PATH } from "./validate-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ── number formatting helpers (thousands separator = narrow space, matching site) ──
export function fmtInt(n) {
  // "2 000" style (regular space — consistent with current page text)
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Product-facing labels use decimal bytes: 400,000 bytes = 400 KB.
const KB = 1000;
const kbLabel = (bytes) => `${bytes % KB === 0 ? bytes / KB : (bytes / KB).toFixed(1)} KB`;

// ── shared TS module (identical for gateway and dashboard) ───────────────────
function tsModule(c) {
  const common = c.common;
  const n = c.capacityModes.normal;
  const p = c.capacityModes.performance;
  const itemKb = kbLabel(common.maxItemBytes); // "400 KB"
  const recKb = kbLabel(common.recommendedItemBytes); // "20 KB"
  const N = {
    totalPerApp: n.totalPerAppPerMinute,
    writesPerApp: n.writeUnitsPerAppPerMinute,
    readsPerApp: n.readsPerAppPerMinute,
    platform: n.platformPerMinute,
    mcpTotal: n.mcpTotalPerMinute,
    mcpWrites: n.mcpWriteUnitsPerMinute,
    mcpReads: n.mcpReadsPerMinute,
  };
  const P = {
    totalPerApp: p.totalPerAppPerMinute,
    writesPerApp: p.writeUnitsPerAppPerMinute,
    readsPerApp: p.readsPerAppPerMinute,
    platform: p.platformPerMinute,
    mcpTotal: p.mcpTotalPerMinute,
    mcpWrites: p.mcpWriteUnitsPerMinute,
    mcpReads: p.mcpReadsPerMinute,
  };
  const fmt = (x) => fmtInt(x);
  const s = [];
  s.push("// GENERATED FILE — DO NOT EDIT.\n// Source: contract/rodex-contract.json\n// Run: npm run contract:generate");
  s.push("");
  s.push(`export const CONTRACT_VERSION = ${JSON.stringify(c.contractVersion)};`);
  s.push("");
  s.push("export const LIMITS = {");
  s.push(`  maxItemBytes: ${common.maxItemBytes},`);
  s.push(`  recommendedItemBytes: ${common.recommendedItemBytes},`);
  s.push(`  maxRequestBytes: ${common.maxRequestBytes},`);
  s.push(`  maxQueryLimit: ${common.maxQueryLimit},`);
  s.push(`  maxBatchItems: ${common.maxBatchItems},`);
  s.push(`  maxBatchBytes: ${common.maxBatchBytes},`);
  s.push(`  adminRequestsPerMinute: ${common.adminRequestsPerMinute},`);
  s.push(`  storageGb: ${common.storageGb},`);
  s.push(`  dailyWorkerRequests: ${common.dailyWorkerRequests},`);
  s.push("} as const;");
  s.push("");
  s.push("export const NORMAL_PROFILE = {");
  for (const k of Object.keys(N)) s.push(`  ${k}: ${N[k]},`);
  s.push("};");
  s.push("");
  s.push("export const PERFORMANCE_PROFILE = {");
  for (const k of Object.keys(P)) s.push(`  ${k}: ${P[k]},`);
  s.push("};");
  s.push("");
  // ── UI / doc strings (built from the same numbers) ──
  s.push("export const CONTRACT_STRINGS = {");
  s.push(`  ITEM_SIZE: ${JSON.stringify(`≤ ${itemKb}`)},`);
  s.push(`  RECOMMENDED_ROW: ${JSON.stringify(recKb)},`);
  s.push(`  MODES_CHIP: ${JSON.stringify(`NORMAL $0 ↔ PERFORMANCE`)},`);
  s.push(`  NORMAL_PER_APP_SHORT: ${JSON.stringify(`${fmt(N.writesPerApp)} WU · ${fmt(N.readsPerApp)} READS / MIN`)},`);
  s.push(`  PERF_GUARDRAILS: ${JSON.stringify("GUARDRAILS ONLY")},`);
  s.push(`  PERF_BILLING: ${JSON.stringify("ON-DEMAND · PAY/USE")},`);
  s.push(`  STORAGE_FREE: ${JSON.stringify(`${c.common.storageGb} GB FREE`)},`);
  s.push(`  NORMAL_WRITES_V: ${JSON.stringify(fmt(N.writesPerApp))},`);
  s.push(`  NORMAL_READS_V: ${JSON.stringify(fmt(N.readsPerApp))},`);
  s.push(`  NORMAL_TOTAL_V: ${JSON.stringify(fmt(N.totalPerApp))},`);
  s.push(`  NORMAL_PLATFORM_V: ${JSON.stringify(fmt(N.platform))},`);
  s.push(`  PERF_TOTAL_V: ${JSON.stringify(fmt(P.totalPerApp))},`);
  s.push(`  PERF_WRITES_V: ${JSON.stringify(fmt(P.writesPerApp))},`);
  s.push(`  PERF_READS_V: ${JSON.stringify(fmt(P.readsPerApp))},`);
  s.push(`  ADMIN_V: ${JSON.stringify("60")},`);
  s.push(`  STORAGE_V: ${JSON.stringify(`${c.common.storageGb} GB`)},`);
  s.push(`  DAILY_WORKERS_V: ${JSON.stringify(fmt(c.common.dailyWorkerRequests))},`);
  s.push(`  WRITES_NOTE: ${JSON.stringify(`write-units per app — put / update / delete (1 unit per KB)`)},`);
  s.push(`  READS_NOTE: ${JSON.stringify(`per app — get / query (strong reads cost 2×)`)},`);
  s.push(`  TOTAL_NOTE: ${JSON.stringify(`per app — writes + reads combined`)},`);
  s.push(`  PLATFORM_NOTE: ${JSON.stringify(`shared by all your apps`)},`);
  s.push(`  ADMIN_NOTE: ${JSON.stringify(`dashboard + API management`)},`);
  s.push(`  ITEM_NOTE: ${JSON.stringify(`413 above the cap · reads return the full row in one call (${recKb} recommended for cheap writes)`)},`);
  s.push(`  STORAGE_NOTE: ${JSON.stringify(`DynamoDB always-free tier · ap-southeast-1`)},`);
  s.push(`  DAILY_WORKERS_NOTE: ${JSON.stringify(`requests/day, shared by gateway + dashboard`)},`);
  s.push(`  PERF_CARD_NOTE: ${JSON.stringify(`on-demand billing — ${fmt(P.totalPerApp)} total / ${fmt(P.writesPerApp)} writes / ${fmt(P.readsPerApp)} reads · switch from console or MCP`)},`);
  s.push(`  MCP_RIDE_LINE: ${JSON.stringify(`MCP budgets ride the same limiter (NORMAL ${fmt(M_N.total)}/${fmt(M_N.writes)}/${fmt(M_N.reads)} per min; PERFORMANCE guardrails); a few hash reads per request`)},`);
  s.push(`  RATE_429_PREVENTION: ${JSON.stringify(`stay under ${fmt(N.totalPerApp)} total / ${fmt(N.writesPerApp)} write-units / ${fmt(N.readsPerApp)} reads per minute (NORMAL)`)},`);
  s.push(`  RATE_429_PLATFORM_CAUSE: ${JSON.stringify(`platform pool (${fmt(N.platform)}/min) shared across your apps`)},`);
  s.push(`  NUMBERS_EXACT: ${JSON.stringify(`${fmt(N.totalPerApp)} req/min total · ${fmt(N.writesPerApp)} write-units/min · ${fmt(N.readsPerApp)} reads/min per app (NORMAL) — ${fmt(N.platform)} req/min platform pool — 60 req/min admin. PERFORMANCE (on-demand): guardrails only — ${fmt(P.totalPerApp)} / ${fmt(P.writesPerApp)} / ${fmt(P.readsPerApp)}.`)},`);
  s.push(`  SAFETY_WRITES: ${JSON.stringify(`${fmt(N.writesPerApp)} write-units/min per app in NORMAL (≈ half the free pool) — guardrails only in PERFORMANCE`)},`);
  s.push(`  MCP_SURFACE_LINE: ${JSON.stringify(`${fmt(N.totalPerApp)} total / ${fmt(N.writesPerApp)} write-units / ${fmt(N.readsPerApp)} reads`)},`);
  s.push(`  APPS_MODAL_BUDGETS: ${JSON.stringify(`physics-honest budgets (${fmt(N.writesPerApp)} write-units / ${fmt(N.readsPerApp)} reads per app-min)`)},`);
  s.push(`  ITEM_CAP_413: ${JSON.stringify(`payload over ${itemKb}`)},`);
  s.push(`  ITEM_CAP_DOCS: ${JSON.stringify(`≤ ${itemKb} per row (413 above)`)},`);
  s.push("} as const;");
  // ── structured STATS + CELL09 (for pages) ──
  s.push("");
  s.push("export const STATS = {");
  s.push("  writeBudget: ["); // hmm — arrays typed loosely; page maps rows {k,v,note}
  s.push(`    { k: "writes / min · NORMAL", v: CONTRACT_STRINGS.NORMAL_WRITES_V, note: CONTRACT_STRINGS.WRITES_NOTE },`);
  s.push(`    { k: "reads / min · NORMAL", v: CONTRACT_STRINGS.NORMAL_READS_V, note: CONTRACT_STRINGS.READS_NOTE },`);
  s.push("  ],");
  s.push("  readPlatform: [");
  s.push(`    { k: "total / min · NORMAL", v: CONTRACT_STRINGS.NORMAL_TOTAL_V, note: CONTRACT_STRINGS.TOTAL_NOTE },`);
  s.push(`    { k: "platform pool · NORMAL", v: CONTRACT_STRINGS.NORMAL_PLATFORM_V, note: CONTRACT_STRINGS.PLATFORM_NOTE },`);
  s.push(`    { k: "PERFORMANCE mode", v: "guardrails", note: CONTRACT_STRINGS.PERF_CARD_NOTE },`);
  s.push(`    { k: "admin surface", v: CONTRACT_STRINGS.ADMIN_V, note: CONTRACT_STRINGS.ADMIN_NOTE },`);
  s.push("  ],");
  s.push("  storageCaps: [");
  s.push(`    { k: "item size · BOTH MODES", v: CONTRACT_STRINGS.ITEM_SIZE, note: CONTRACT_STRINGS.ITEM_NOTE },`);
  s.push(`    { k: "storage", v: CONTRACT_STRINGS.STORAGE_V, note: CONTRACT_STRINGS.STORAGE_NOTE },`);
  s.push(`    { k: "daily workers", v: CONTRACT_STRINGS.DAILY_WORKERS_V, note: CONTRACT_STRINGS.DAILY_WORKERS_NOTE },`);
  s.push("  ],");
  s.push("} as const;");
  s.push("");
  s.push("export const CELL09 = {");
  s.push(`  itemSize: { bound: "Item size · both modes", normal: CONTRACT_STRINGS.ITEM_CAP_DOCS + " · reads return the full row in one call", performance: "same" },`);
  s.push(`  total: { bound: "Per app · total", normal: ${JSON.stringify(`${fmt(N.totalPerApp)} req/min`)}, performance: ${JSON.stringify(`${fmt(P.totalPerApp)} req/min guardrail`)} },`);
  s.push(`  writes: { bound: "Per app · writes", normal: ${JSON.stringify(`${fmt(N.writesPerApp)} write-units/min (1 unit per KB)`)}, performance: ${JSON.stringify(`${fmt(P.writesPerApp)} write-units/min guardrail`)} },`);
  s.push(`  reads: { bound: "Per app · reads", normal: ${JSON.stringify(`${fmt(N.readsPerApp)} reads/min`)}, performance: ${JSON.stringify(`${fmt(P.readsPerApp)} reads/min guardrail`)} },`);
  s.push(`  platform: { bound: "Platform pool", normal: ${JSON.stringify(`${fmt(N.platform)} units/min across apps`)}, performance: ${JSON.stringify(`${fmt(P.platform)} units/min guardrail`)} },`);
  s.push(`  admin: { bound: "Admin surface", normal: "60 req/min", performance: "60 req/min" },`);
  s.push(`  storage: { bound: "Storage", normal: "25 GB DynamoDB free tier · ap-southeast-1", performance: "25 GB DynamoDB free tier · ap-southeast-1" },`);
  s.push("} as const;");
  s.push("");
  return s.join("\n");
}

// M_N helper used above for MCP line
const M_N = { total: 0, writes: 0, reads: 0 };

// ── Markdown fragments ───────────────────────────────────────────────────────
function initMCP(c) {
  M_N.total = c.capacityModes.normal.mcpTotalPerMinute;
  M_N.writes = c.capacityModes.normal.mcpWriteUnitsPerMinute;
  M_N.reads = c.capacityModes.normal.mcpReadsPerMinute;
}

function capacityTable(c) {
  const n = c.capacityModes.normal;
  const p = c.capacityModes.performance;
  const rows = [
    ["DynamoDB billing", `${n.billing} 5/5 per table — $0 (free tier)`, `${p.billing} — pay-per-request`],
    ["Item size (both modes)", `≤ ${kbLabel(c.common.maxItemBytes)}`, `≤ ${kbLabel(c.common.maxItemBytes)}`],
    ["Per-app write budget", `${fmtInt(n.writeUnitsPerAppPerMinute)} write-units/min (~13/s — half the free pool)`, `Guardrail only: ${fmtInt(p.writeUnitsPerAppPerMinute)} units/min`],
    ["Per-app read budget", `${fmtInt(n.readsPerAppPerMinute)}/min`, `Guardrail only: ${fmtInt(p.readsPerAppPerMinute)}/min`],
    ["Total per app", `${fmtInt(n.totalPerAppPerMinute)}/min`, `${fmtInt(p.totalPerAppPerMinute)}/min`],
    ["Platform pool", `${fmtInt(n.platformPerMinute)}/min`, `${fmtInt(p.platformPerMinute)}/min`],
    ["Batch/put", `≤ ${c.common.maxBatchItems} items, ≤ ${kbLabel(c.common.maxBatchBytes)} total`, "same"],
    ["429s", "Yes — name the budget + retry_after", "Practically never (runaway protection only)"],
  ];
  const lines = [];
  lines.push(`|  | NORMAL (${n.billing}) | PERFORMANCE (${p.billing}) |`);
  lines.push(`|---|---:|---:|`);
  for (const [k, a, b] of rows) lines.push(`| ${k} | ${a} | ${b} |`);
  return lines.join("\n");
}

function capacityMd(c) {
  return `<!-- BEGIN GENERATED: capacity -->\n${capacityTable(c)}\n<!-- END GENERATED: capacity -->\n`;
}

function rateLimitsTable(c) {
  const common = c.common;
  const n = c.capacityModes.normal;
  const p = c.capacityModes.performance;
  const lines = [];
  lines.push(`### Common caps (both modes)`);
  lines.push(`| Cap | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Item size (hard) | ≤ ${kbLabel(common.maxItemBytes)} (413 above) |`);
  lines.push(`| Recommended row | ≤ ${kbLabel(common.recommendedItemBytes)} (1 unit per KB — cost-friendly) |`);
  lines.push(`| Batch put | ≤ ${common.maxBatchItems} items · ≤ ${kbLabel(common.maxBatchBytes)} total |`);
  lines.push(`| Query limit | ≤ ${common.maxQueryLimit} rows |`);
  lines.push(`| Admin surface | ${common.adminRequestsPerMinute} req/min |`);
  lines.push(`| Storage | ${common.storageGb} GB free (ap-southeast-1) |`);
  lines.push(``);
  lines.push(`### Per-app budgets (per 60 s window)`);
  lines.push(`| Budget | NORMAL | PERFORMANCE |`);
  lines.push(`|---|---:|---:|`);
  lines.push(`| Total req/min | ${fmtInt(n.totalPerAppPerMinute)} | ${fmtInt(p.totalPerAppPerMinute)} guardrail |`);
  lines.push(`| Write units/min | ${fmtInt(n.writeUnitsPerAppPerMinute)} | ${fmtInt(p.writeUnitsPerAppPerMinute)} guardrail |`);
  lines.push(`| Reads/min | ${fmtInt(n.readsPerAppPerMinute)} | ${fmtInt(p.readsPerAppPerMinute)} guardrail |`);
  lines.push(`| Platform pool/min | ${fmtInt(n.platformPerMinute)} | ${fmtInt(p.platformPerMinute)} guardrail |`);
  return lines.join("\n");
}

function rateLimitsMd(c) {
  return `<!-- BEGIN GENERATED: rate-limits -->\n${rateLimitsTable(c)}\n<!-- END GENERATED: rate-limits -->\n`;
}

function mcpCapacityTable(c) {
  const n = c.capacityModes.normal;
  const p = c.capacityModes.performance;
  const lines = [];
  lines.push(`| Mode | MCP total/min | MCP write-units/min | MCP reads/min |`);
  lines.push(`|---|---:|---:|---:|`);
  lines.push(`| ${n.label} (${n.billing}) | ${fmtInt(n.mcpTotalPerMinute)} | ${fmtInt(n.mcpWriteUnitsPerMinute)} | ${fmtInt(n.mcpReadsPerMinute)} |`);
  lines.push(`| ${p.label} (${p.billing}) | ${fmtInt(p.mcpTotalPerMinute)} | ${fmtInt(p.mcpWriteUnitsPerMinute)} | ${fmtInt(p.mcpReadsPerMinute)} (guardrail) |`);
  return lines.join("\n");
}

function mcpCapacityMd(c) {
  return `<!-- BEGIN GENERATED: mcp-capacity -->\n${mcpCapacityTable(c)}\n<!-- END GENERATED: mcp-capacity -->\n`;
}

// ── README + openapi marked regions ─────────────────────────────────────────
function readmeRow(c) {
  const n = c.capacityModes.normal;
  const p = c.capacityModes.performance;
  return `NORMAL: ${fmtInt(n.writeUnitsPerAppPerMinute)} write-units + ${fmtInt(n.readsPerAppPerMinute)} reads per app/min · PERFORMANCE (on-demand): guardrails only — switch anytime from console/MCP`;
}

function openapiBlock(c) {
  const n = c.capacityModes.normal;
  const p = c.capacityModes.performance;
  return [
    "# BEGIN GENERATED: capacity",
    `normal: { billing: ${n.billing}, totalPerAppPerMinute: ${n.totalPerAppPerMinute}, writeUnitsPerAppPerMinute: ${n.writeUnitsPerAppPerMinute}, readsPerAppPerMinute: ${n.readsPerAppPerMinute}, platformPerMinute: ${n.platformPerMinute}, mcp: { total: ${n.mcpTotalPerMinute}, writes: ${n.mcpWriteUnitsPerMinute}, reads: ${n.mcpReadsPerMinute} } }`, 
    `performance: { billing: ${p.billing}, totalPerAppPerMinute: ${p.totalPerAppPerMinute}, writeUnitsPerAppPerMinute: ${p.writeUnitsPerAppPerMinute}, readsPerAppPerMinute: ${p.readsPerAppPerMinute}, platformPerMinute: ${p.platformPerMinute}, mcp: { total: ${p.mcpTotalPerMinute}, writes: ${p.mcpWriteUnitsPerMinute}, reads: ${p.mcpReadsPerMinute} } }`, 
    "# END GENERATED: capacity",
  ].join("\n");
}

// ── markers ──────────────────────────────────────────────────────────────────
const MARK = (name) => `<!-- BEGIN GENERATED: ${name} -->`;
const MARK_END = (name) => `<!-- END GENERATED: ${name} -->`;

function replaceRegion(text, name, replacement) {
  const start = MARK(name);
  const end = MARK_END(name);
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(`marker region ${name} not found (or malformed) in target`);
  }
  return text.slice(0, i + start.length) + "\n" + replacement.replace(/\n$/, "") + "\n" + text.slice(j);
}

function yamlRegion(text, name, replacement) {
  const start = `# BEGIN GENERATED: ${name}`;
  const end = `# END GENERATED: ${name}`;
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(`yaml marker region ${name} not found in openapi.yaml`);
  }
  if (!text.startsWith("openapi:") || !text.includes("x-rodex-capacity:")) {
    throw new Error("refusing to modify malformed docs/openapi.yaml: expected openapi and x-rodex-capacity markers");
  }
  // Preserve the x-rodex-capacity block's indentation and replace complete lines.
  const lineStart = text.lastIndexOf("\n", i) + 1;
  const endLine = text.indexOf("\n", j);
  const afterEnd = endLine === -1 ? text.length : endLine + 1;
  const indent = text.slice(lineStart, i);
  const indented = replacement.split("\n").map((line) => indent + line).join("\n");
  return text.slice(0, lineStart) + indented + "\n" + text.slice(afterEnd);
}

// ── targets ──────────────────────────────────────────────────────────────────
function buildTargets(c) {
  const ts = tsModule(c);
  return {
    "gateway/src/generated/contract.ts": ts,
    "dashboard/src/generated/contract.ts": ts,
    "docs/generated/capacity.md": capacityMd(c),
    "docs/generated/rate-limits.md": rateLimitsMd(c),
    "docs/generated/mcp-capacity.md": mcpCapacityMd(c),
  };
}

function main() {
  const check = process.argv.includes("--check");
  const contract = loadContract();
  const { ok, problems } = validateContract(contract);
  if (!ok) {
    console.error("CONTRACT INVALID — refusing to generate:");
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  initMCP(contract);

  const diffs = [];

  // full-file outputs
  const targets = buildTargets(contract);
  for (const [rel, content] of Object.entries(targets)) {
    const abs = join(root, rel);
    if (check) {
      const existing = readFileSync(abs, "utf8");
      if (existing !== content) diffs.push(rel);
    } else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  }

  // marked regions
  const regionTargets = [
    { rel: "README.md", name: "limits-row", gen: readmeRow(contract) },
    { rel: "docs/capacity.md", name: "capacity", gen: capacityTable(contract) },
    { rel: "docs/rate-limits.md", name: "rate-limits", gen: rateLimitsTable(contract) },
    { rel: "docs/mcp.md", name: "mcp-capacity", gen: mcpCapacityTable(contract) },
  ];
  const yamlTargets = [
    { rel: "docs/openapi.yaml", name: "capacity", gen: openapiBlock(contract) },
  ];
  for (const rt of regionTargets) {
    const abs = join(root, rt.rel);
    const text = readFileSync(abs, "utf8");
    const updated = replaceRegion(text, rt.name, rt.gen);
    if (check) {
      if (updated !== text) diffs.push(rt.rel);
    } else {
      writeFileSync(abs, updated);
    }
  }
  for (const rt of yamlTargets) {
    const abs = join(root, rt.rel);
    const text = readFileSync(abs, "utf8");
    const updated = yamlRegion(text, rt.name, rt.gen);
    if (check) {
      if (updated !== text) diffs.push(rt.rel);
    } else {
      writeFileSync(abs, updated);
    }
  }

  if (check) {
    if (diffs.length) {
      console.error(`CONTRACT DRIFT DETECTED — regenerate with: npm run contract:generate`);
      for (const d of diffs) console.error(`  ✗ ${d}`);
      process.exit(1);
    }
    console.log("CONTRACT FRESH ✓ (no drift)");
    process.exit(0);
  }
  console.log("CONTRACT GENERATED ✓");
}

main();