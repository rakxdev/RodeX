#!/usr/bin/env node
/**
 * validate-contract.mjs — structural + invariant validation for the canonical
 * RodeX public contract (contract/rodex-contract.json).
 *
 * Usage:
 *   node scripts/validate-contract.mjs            # CLI (exit 0/1)
 *   import { validateContract } from …            # library (throws on invalid)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const CONTRACT_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "contract", "rodex-contract.json");

export function validateContract(contract) {
  const problems = [];
  const warn = [];

  function need(cond, msg) {
    if (!cond) problems.push(msg);
  }

  function needInt(obj, key, where) {
    const v = obj?.[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
      problems.push(`${where}.${key} must be a positive integer (got ${JSON.stringify(v)})`);
      return null;
    }
    return v;
  }

  need(typeof contract === "object" && contract !== null, "root must be an object");
  need(typeof contract.contractVersion === "string" && contract.contractVersion.length > 0, "contractVersion must be a non-empty string");
  need(typeof contract.common === "object" && contract.common !== null, "common must exist");
  need(typeof contract.capacityModes?.normal === "object" && contract.capacityModes.normal !== null, "capacityModes.normal must exist");
  need(typeof contract.capacityModes?.performance === "object" && contract.capacityModes.performance !== null, "capacityModes.performance must exist");
  need(typeof contract.mcp === "object" && contract.mcp !== null, "mcp must exist");

  if (contract.common) {
    needInt(contract.common, "maxItemBytes", "common");
    needInt(contract.common, "recommendedItemBytes", "common");
    needInt(contract.common, "maxRequestBytes", "common");
    needInt(contract.common, "maxQueryLimit", "common");
    needInt(contract.common, "maxBatchItems", "common");
    needInt(contract.common, "maxBatchBytes", "common");
    needInt(contract.common, "adminRequestsPerMinute", "common");
    needInt(contract.common, "storageGb", "common");
    needInt(contract.common, "dailyWorkerRequests", "common");

    const maxItem = contract.common.maxItemBytes;
    const maxReq = contract.common.maxRequestBytes;
    if (maxItem && maxReq && maxItem > maxReq) problems.push("common.maxItemBytes must be ≤ common.maxRequestBytes");
    if (maxItem && contract.common.recommendedItemBytes > maxItem) problems.push("common.recommendedItemBytes must be ≤ common.maxItemBytes");
    if (maxItem && contract.common.maxBatchBytes > maxItem * contract.common.maxBatchItems) {
      warn.push("warn: common.maxBatchBytes > maxItemBytes × maxBatchItems (may be intentional — total body cap)");
    }
  }

  for (const mode of ["normal", "performance"]) {
    const m = contract.capacityModes?.[mode];
    if (!m) continue;
    needInt(m, "totalPerAppPerMinute", `capacityModes.${mode}`);
    needInt(m, "writeUnitsPerAppPerMinute", `capacityModes.${mode}`);
    needInt(m, "readsPerAppPerMinute", `capacityModes.${mode}`);
    needInt(m, "platformPerMinute", `capacityModes.${mode}`);
    needInt(m, "mcpTotalPerMinute", `capacityModes.${mode}`);
    needInt(m, "mcpWriteUnitsPerMinute", `capacityModes.${mode}`);
    needInt(m, "mcpReadsPerMinute", `capacityModes.${mode}`);
    need(["provisioned", "on-demand"].includes(m.billing), `capacityModes.${mode}.billing must be 'provisioned' or 'on-demand'`);
    need(typeof m.label === "string" && m.label.length > 0, `capacityModes.${mode}.label must be a non-empty string`);
    need(typeof m.description === "string" && m.description.length > 0, `capacityModes.${mode}.description must be a non-empty string`);
  }

  const n = contract.capacityModes?.normal;
  const p = contract.capacityModes?.performance;
  if (n && p) {
    for (const key of [
      "totalPerAppPerMinute",
      "writeUnitsPerAppPerMinute",
      "readsPerAppPerMinute",
      "platformPerMinute",
      "mcpTotalPerMinute",
      "mcpWriteUnitsPerMinute",
      "mcpReadsPerMinute",
    ]) {
      if (typeof n[key] === "number" && typeof p[key] === "number" && p[key] < n[key]) {
        problems.push(`capacityModes.performance.${key} (${p[key]}) must be ≥ capacityModes.normal.${key} (${n[key]})`);
      }
    }
    need(n.billing === "provisioned", "capacityModes.normal.billing must be 'provisioned'");
    need(p.billing === "on-demand", "capacityModes.performance.billing must be 'on-demand'");
  }

  if (contract.mcp) {
    need(typeof contract.mcp.endpoint === "string" && contract.mcp.endpoint.startsWith("/"), "mcp.endpoint must be a string starting with '/'");
    need(typeof contract.mcp.masterKeyPrefix === "string" && contract.mcp.masterKeyPrefix.length > 0, "mcp.masterKeyPrefix must be a non-empty string");
    need(typeof contract.mcp.confirmationRequired === "boolean", "mcp.confirmationRequired must be a boolean");
  }

  return { ok: problems.length === 0, problems, warns: warn };
}

export function loadContract() {
  return JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
}

// CLI entry (only when executed directly)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let contract;
  try {
    contract = loadContract();
  } catch (e) {
    console.error(`FATAL: cannot parse ${CONTRACT_PATH}: ${e.message}`);
    process.exit(1);
  }
  const { ok, problems, warns } = validateContract(contract);
  for (const w of warns) console.warn(w);
  if (!ok) {
    console.error(`CONTRACT INVALID — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`CONTRACT VALID ✓ (contractVersion ${contract.contractVersion})`);
}