// GENERATED FILE — DO NOT EDIT.
// Source: contract/rodex-contract.json
// Run: npm run contract:generate

export const CONTRACT_VERSION = "0.5.1";

export const LIMITS = {
  maxItemBytes: 400000,
  recommendedItemBytes: 20000,
  maxRequestBytes: 1000000,
  maxQueryLimit: 100,
  maxBatchItems: 50,
  maxBatchBytes: 400000,
  adminRequestsPerMinute: 60,
  storageGb: 25,
  dailyWorkerRequests: 100000,
} as const;

export const NORMAL_PROFILE = {
  totalPerApp: 2000,
  writesPerApp: 800,
  readsPerApp: 800,
  platform: 2400,
  mcpTotal: 2000,
  mcpWrites: 800,
  mcpReads: 800,
};

export const PERFORMANCE_PROFILE = {
  totalPerApp: 500000,
  writesPerApp: 100000,
  readsPerApp: 400000,
  platform: 2000000,
  mcpTotal: 500000,
  mcpWrites: 100000,
  mcpReads: 400000,
};

export const CONTRACT_STRINGS = {
  ITEM_SIZE: "≤ 400 KB",
  RECOMMENDED_ROW: "20 KB",
  MODES_CHIP: "NORMAL $0 ↔ PERFORMANCE",
  NORMAL_PER_APP_SHORT: "800 WU · 800 READS / MIN",
  PERF_GUARDRAILS: "GUARDRAILS ONLY",
  PERF_BILLING: "ON-DEMAND · PAY/USE",
  STORAGE_FREE: "25 GB FREE",
  NORMAL_WRITES_V: "800",
  NORMAL_READS_V: "800",
  NORMAL_TOTAL_V: "2 000",
  NORMAL_PLATFORM_V: "2 400",
  PERF_TOTAL_V: "500 000",
  PERF_WRITES_V: "100 000",
  PERF_READS_V: "400 000",
  ADMIN_V: "60",
  STORAGE_V: "25 GB",
  DAILY_WORKERS_V: "100 000",
  WRITES_NOTE: "write-units per app — put / update / delete (1 unit per KB)",
  READS_NOTE: "per app — get / query (strong reads cost 2×)",
  TOTAL_NOTE: "per app — writes + reads combined",
  PLATFORM_NOTE: "shared by all your apps",
  ADMIN_NOTE: "dashboard + API management",
  ITEM_NOTE: "413 above the cap · reads return the full row in one call (20 KB recommended for cheap writes)",
  STORAGE_NOTE: "DynamoDB always-free tier · ap-southeast-1",
  DAILY_WORKERS_NOTE: "requests/day, shared by gateway + dashboard",
  PERF_CARD_NOTE: "on-demand billing — 500 000 total / 100 000 writes / 400 000 reads · switch from console or MCP",
  MCP_RIDE_LINE: "MCP budgets ride the same limiter (NORMAL 2 000/800/800 per min; PERFORMANCE guardrails); a few hash reads per request",
  RATE_429_PREVENTION: "stay under 2 000 total / 800 write-units / 800 reads per minute (NORMAL)",
  RATE_429_PLATFORM_CAUSE: "platform pool (2 400/min) shared across your apps",
  NUMBERS_EXACT: "2 000 req/min total · 800 write-units/min · 800 reads/min per app (NORMAL) — 2 400 req/min platform pool — 60 req/min admin. PERFORMANCE (on-demand): guardrails only — 500 000 / 100 000 / 400 000.",
  SAFETY_WRITES: "800 write-units/min per app in NORMAL (≈ half the free pool) — guardrails only in PERFORMANCE",
  MCP_SURFACE_LINE: "2 000 total / 800 write-units / 800 reads",
  APPS_MODAL_BUDGETS: "physics-honest budgets (800 write-units / 800 reads per app-min)",
  ITEM_CAP_413: "payload over 400 KB",
  ITEM_CAP_DOCS: "≤ 400 KB per row (413 above)",
} as const;

export const STATS = {
  writeBudget: [
    { k: "writes / min · NORMAL", v: CONTRACT_STRINGS.NORMAL_WRITES_V, note: CONTRACT_STRINGS.WRITES_NOTE },
    { k: "reads / min · NORMAL", v: CONTRACT_STRINGS.NORMAL_READS_V, note: CONTRACT_STRINGS.READS_NOTE },
  ],
  readPlatform: [
    { k: "total / min · NORMAL", v: CONTRACT_STRINGS.NORMAL_TOTAL_V, note: CONTRACT_STRINGS.TOTAL_NOTE },
    { k: "platform pool · NORMAL", v: CONTRACT_STRINGS.NORMAL_PLATFORM_V, note: CONTRACT_STRINGS.PLATFORM_NOTE },
    { k: "PERFORMANCE mode", v: "guardrails", note: CONTRACT_STRINGS.PERF_CARD_NOTE },
    { k: "admin surface", v: CONTRACT_STRINGS.ADMIN_V, note: CONTRACT_STRINGS.ADMIN_NOTE },
  ],
  storageCaps: [
    { k: "item size · BOTH MODES", v: CONTRACT_STRINGS.ITEM_SIZE, note: CONTRACT_STRINGS.ITEM_NOTE },
    { k: "storage", v: CONTRACT_STRINGS.STORAGE_V, note: CONTRACT_STRINGS.STORAGE_NOTE },
    { k: "daily workers", v: CONTRACT_STRINGS.DAILY_WORKERS_V, note: CONTRACT_STRINGS.DAILY_WORKERS_NOTE },
  ],
} as const;

export const CELL09 = {
  itemSize: { bound: "Item size · both modes", normal: CONTRACT_STRINGS.ITEM_CAP_DOCS + " · reads return the full row in one call", performance: "same" },
  total: { bound: "Per app · total", normal: "2 000 req/min", performance: "500 000 req/min guardrail" },
  writes: { bound: "Per app · writes", normal: "800 write-units/min (1 unit per KB)", performance: "100 000 write-units/min guardrail" },
  reads: { bound: "Per app · reads", normal: "800 reads/min", performance: "400 000 reads/min guardrail" },
  platform: { bound: "Platform pool", normal: "2 400 units/min across apps", performance: "2 000 000 units/min guardrail" },
  admin: { bound: "Admin surface", normal: "60 req/min", performance: "60 req/min" },
  storage: { bound: "Storage", normal: "25 GB DynamoDB free tier · ap-southeast-1", performance: "25 GB DynamoDB free tier · ap-southeast-1" },
} as const;
