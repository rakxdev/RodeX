/**
 * build.mjs — dual CJS/ESM build, one command.
 * ESM: tsc → dist/esm (with .d.ts) ; CJS: esbuild bundle → dist/cjs/index.cjs
 * Keep this file identical across packages/rodexdb and packages/rodex-mcp.
 */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/cjs", { recursive: true });
execSync("npx tsc -p tsconfig.json", { stdio: "inherit" });
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  outfile: "dist/cjs/index.cjs",
  logLevel: "info",
});
console.log("✓ ESM + types + CJS bundle built");
