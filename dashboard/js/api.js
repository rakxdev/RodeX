/* RodeX dashboard — shared config + API helper */

// GATEWAY: dev default. On deploy, replace with your worker URL,
// e.g. https://rodex-gateway.<your-subdomain>.workers.dev
const CONFIG = {
  GATEWAY: "http://localhost:8787",
};

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const res = await fetch(CONFIG.GATEWAY + path, {
    method,
    credentials: "include",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON (e.g. redirects) */
  }
  if (!res.ok || (data && data.ok === false)) {
    const msg = data && data.error ? data.error.message : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data ? data.result : data;
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTime(sec) {
  if (!sec) return "—";
  return new Date(sec * 1000).toLocaleString();
}

async function logout() {
  try {
    await api("POST", "/v1/admin/logout", {});
  } catch {
    /* ignore */
  }
  window.location.href = "index.html";
}

function showMsg(el, text, ok) {
  el.textContent = text;
  el.className = "msg " + (ok ? "ok" : "err");
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.hidden = true), ok ? 4000 : 8000);
}