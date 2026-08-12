#!/usr/bin/env node
/**
 * Active-document drift guard. Historical reviews, changelogs, ADRs, and the
 * intentionally smaller TEST_PROFILE are excluded by policy.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), "");
const excluded = [
  "node_modules/",
  ".git/",
  "dist/",
  "CHANGELOG.md",
  "docs/REAL_USER_REVIEW.md",
  "docs/BULKLOAD_REVIEW.md",
  "docs/decisions/",
  "tasks/mcp-plan.md",
  "gateway/test/",
  "gateway/src/limits.ts", // TEST_PROFILE intentionally retains test-only values
  "scripts/",
];
const patterns = [
  /600\s*\/\s*min/i,
  /600\s+total\s*\/\s*120/i,
  /120\s*\/\s*min/i,
  /240\s*\/\s*min/i,
  /1\s*000\s*\/\s*(?:min|req)/i,
  /120\s+writes\/min/i,
  /240\s+reads\/min/i,
  /payload over 20 KB/i,
  /20 KB (?:write )?cap/i,
  /Items cap at 20 KB/i,
];
const extensions = new Set([".md", ".ts", ".tsx", ".yaml", ".yml", ".mjs", ".json"]);

function ignored(rel) {
  return excluded.some((p) => rel === p || rel.startsWith(p));
}
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(root, abs).replaceAll("\\", "/");
    if (ignored(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs));
    else if (extensions.has(extname(abs))) out.push(abs);
  }
  return out;
}

const findings = [];
for (const file of walk(root)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/\b(?:old|legacy|historical)\b/i.test(line)) return;
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        findings.push(`${rel}:${index + 1}: ${line.trim()}`);
        break;
      }
    }
  });
}

if (findings.length) {
  console.error(`ACTIVE CONTRACT DRIFT — ${findings.length} finding(s):`);
  findings.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log("ACTIVE CONTRACT TEXT CLEAN ✓");
