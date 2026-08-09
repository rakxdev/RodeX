import path from "node:path";
import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Dev/preview proxy to the live gateway: the browser talks same-origin
 * (no CORS), and the proxy strips the Origin header so the gateway's strict
 * origin allowlist never rejects tunnel/localhost previews. Production builds
 * are unaffected (no proxy in the built assets).
 */
const GATEWAY = "https://rodex-gateway.rakxdev.workers.dev";

const proxy: Record<string, string | ProxyOptions> = {
  "/v1": {
    target: GATEWAY,
    changeOrigin: true,
    configure: (p) => {
      p.on("proxyReq", (proxyReq) => {
        proxyReq.removeHeader("origin");
        proxyReq.removeHeader("referer");
      });
    },
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: { proxy },
  preview: {
    proxy,
    // local preview only — accept any host (Cloudflare tunnel hostnames)
    allowedHosts: true,
  },
});
