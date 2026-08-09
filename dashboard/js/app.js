/* app.html logic — detail, one-time key, tables, quick query */
const id = qs("id");
const msg = document.getElementById("msg");
const apiKeyEl = document.getElementById("apiKey");
const keyCard = document.getElementById("keyCard");
let app = null;
let tables = [];

async function load() {
  try {
    app = await api("GET", `/v1/admin/apps/${id}`);
  } catch (err) {
    document.getElementById("title").textContent = "App not found";
    showMsg(msg, err.message, false);
    return;
  }
  document.getElementById("title").textContent = app.name;
  document.getElementById("appId").textContent = app.app_id;
  const st = document.getElementById("status");
  st.textContent = app.status + (app.purge_at ? " · purge " + fmtTime(app.purge_at) : "");
  st.className = "badge " + esc(app.status);
  document.getElementById("keyPrefix").textContent = app.key_prefix + "…";
  document.getElementById("created").textContent = fmtTime(app.created_at);
  document.getElementById("tables").textContent = app.tables.length ? app.tables.join(", ") : "—";
  document.getElementById("baseUrl").textContent = CONFIG.GATEWAY;

  tables = app.tables;
  renderTables();

  // one-time key from creation/rotation
  const fresh = sessionStorage.getItem("freshKey");
  if (fresh) {
    sessionStorage.removeItem("freshKey");
    showKey(fresh, "This key is shown once — store it securely!");
  }

  document.getElementById("suspendBtn").textContent = app.status === "suspended" ? "Resume" : "Suspend";
  document.getElementById("deleteBtn").hidden = app.status === "deleting";
  updateCurl();
}

function showKey(key, note) {
  apiKeyEl.textContent = key;
  keyCard.hidden = false;
  document.querySelector("#keyCard .small").textContent = note || "This key is shown once — store it securely!";
  saveKey(key);
}

// App-key storage: sessionStorage only (never sent to the server).
function keyStoreName() {
  return "rodex_key_" + id;
}
function saveKey(k) {
  sessionStorage.setItem(keyStoreName(), k);
  updateConnectedState();
}
function getKey() {
  return sessionStorage.getItem(keyStoreName());
}
function updateConnectedState() {
  const el = document.getElementById("connectedState");
  el.textContent = getKey() ? "✓ key stored in this tab (session)" : "no key stored yet";
}
function appHeaders() {
  const k = getKey();
  return k ? { "X-App-Id": id, "X-Api-Key": k } : {};
}

function updateCurl() {
  const curl = document.getElementById("curl");
  curl.textContent = `# 1) write a row
curl -X POST ${CONFIG.GATEWAY}/v1/item/put \\
  -H "Content-Type: application/json" \\
  -H "X-App-Id: ${id}" \\
  -H "X-Api-Key: YOUR_KEY" \\
  -d '{"table":"users","item":{"pk":"USER#1","sk":"PROFILE","name":"Rakesh"},"request_id":"req-1"}'

# 2) read it back
curl -X POST ${CONFIG.GATEWAY}/v1/item/get \\
  -H "Content-Type: application/json" \\
  -H "X-App-Id: ${id}" \\
  -H "X-Api-Key: YOUR_KEY" \\
  -d '{"table":"users","pk":"USER#1","sk":"PROFILE"}'

# 3) update (version-guarded)
curl -X POST ${CONFIG.GATEWAY}/v1/item/update \\
  -H "Content-Type: application/json" \\
  -H "X-App-Id: ${id}" \\
  -H "X-Api-Key: YOUR_KEY" \\
  -d '{"table":"users","pk":"USER#1","sk":"PROFILE","data":{"name":"Rakesh v2"},"expected_version":1}'

# 4) delete
curl -X POST ${CONFIG.GATEWAY}/v1/item/delete \\
  -H "Content-Type: application/json" \\
  -H "X-App-Id: ${id}" \\
  -H "X-Api-Key: YOUR_KEY" \\
  -d '{"table":"users","pk":"USER#1","sk":"PROFILE"}'
`;
}

function renderTables() {
  const tbody = document.getElementById("tableRows");
  if (!tables.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="muted">No tables yet</td></tr>';
    return;
  }
  tbody.innerHTML = tables
    .map((t) => `<tr><td class="mono">${esc(t)}</td><td class="mono small muted">app_${esc(id)}_${esc(t)}</td></tr>`)
    .join("");
  const sel = document.getElementById("qTable");
  sel.innerHTML = tables.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
}

document.getElementById("copyKey").addEventListener("click", async () => {
  await navigator.clipboard.writeText(apiKeyEl.textContent);
  showMsg(msg, "Key copied to clipboard", true);
});

document.getElementById("connectBtn").addEventListener("click", async () => {
  const k = document.getElementById("connectKeyInput").value.trim();
  if (!k) {
    showMsg(msg, "Paste the app's API key first", false);
    return;
  }
  saveKey(k);
  document.getElementById("connectKeyInput").value = "";
  showMsg(msg, "Key stored for this tab — you can now create tables / query", true);
});

document.getElementById("createTable").addEventListener("click", async () => {
  const name = document.getElementById("tableName").value.trim();
  const btn = document.getElementById("createTable");
  if (!getKey()) {
    showMsg(msg, "Connect the app key above first", false);
    return;
  }
  btn.disabled = true;
  try {
    await appApi("POST", "/v1/table/create", { name });
    showMsg(msg, `Table '${name}' created`, true);
    document.getElementById("tableName").value = "";
    load();
  } catch (err) {
    showMsg(msg, err.message, false);
    btn.disabled = false;
  }
});

document.getElementById("rotateBtn").addEventListener("click", async () => {
  try {
    const { api_key } = await api("POST", `/v1/admin/apps/${id}/rotate-key`, {});
    showKey(api_key, "New key — shown once! The old key stopped working immediately.");
    showMsg(msg, "Key rotated", true);
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

document.getElementById("suspendBtn").addEventListener("click", async () => {
  try {
    const act = app.status === "suspended" ? "resume" : "suspend";
    await api("POST", `/v1/admin/apps/${id}/${act}`, {});
    load();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

document.getElementById("deleteBtn").addEventListener("click", async () => {
  if (!confirm("Delete this app? It enters a 5-minute recovery window; tables are wiped after.")) return;
  try {
    await api("DELETE", `/v1/admin/apps/${id}`, {});
    showMsg(msg, "App marked for deletion — recoverable 5 min", true);
    load();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

document.getElementById("runQuery").addEventListener("click", async () => {
  const table = document.getElementById("qTable").value;
  const pk = document.getElementById("qPk").value.trim();
  const skPrefix = document.getElementById("qSk").value.trim() || undefined;
  const out = document.getElementById("queryOut");
  if (!table || !pk) {
    showMsg(msg, "Pick a table and enter a pk", false);
    return;
  }
  if (!getKey()) {
    showMsg(msg, "Connect the app key above first", false);
    return;
  }
  try {
    const r = await appApi("POST", "/v1/query", { table, pk, sk_prefix: skPrefix, limit: 20 });
    out.textContent = JSON.stringify(r, null, 2);
    out.hidden = false;
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

// app-level call with the connected key (admin session not used)
async function appApi(method, path, body) {
  const headers = { "Content-Type": "application/json", ...appHeaders() };
  const res = await fetch(CONFIG.GATEWAY + path, {
    method,
    credentials: "omit",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.ok === false)) {
    const err = new Error(data && data.error ? data.error.message : `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data ? data.result : data;
}

document.getElementById("logout").addEventListener("click", logout);
updateConnectedState();
load();