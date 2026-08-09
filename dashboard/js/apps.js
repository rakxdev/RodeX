/* apps.html logic — list, create, suspend/resume, rotate, delete */
const rows = document.getElementById("rows");
const msg = document.getElementById("msg");

async function loadApps() {
  rows.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
  try {
    const { apps } = await api("GET", "/v1/admin/apps");
    if (apps.length === 0) {
      rows.innerHTML = '<tr><td colspan="6" class="muted">No apps yet — create your first one above.</td></tr>';
      return;
    }
    rows.innerHTML = "";
    for (const a of apps) {
      const tr = document.createElement("tr");
      const del = a.status === "deleting";
      tr.innerHTML = `
        <td><a href="app.html?id=${esc(a.app_id)}" style="color:var(--accent);text-decoration:none;font-weight:600">${esc(a.name)}</a></td>
        <td class="mono small">${esc(a.app_id)}</td>
        <td><span class="badge ${esc(a.status)}">${esc(a.status)}${del ? " · purge " + fmtTime(a.purge_at) : ""}</span></td>
        <td class="mono small">${esc(a.key_prefix)}…</td>
        <td class="small">${fmtTime(a.created_at)}</td>
        <td class="row" style="justify-content:flex-end">
          <a class="btn ghost" style="text-decoration:none;font-size:12px;padding:5px 10px" href="app.html?id=${esc(a.app_id)}">Open</a>
          ${del ? `<button class="ghost small-btn" data-act="recover" data-id="${esc(a.app_id)}" data-name="${esc(a.name)}">Recover</button>` : ""}
          ${del ? `<button class="danger small-btn" data-act="force" data-id="${esc(a.app_id)}" data-name="${esc(a.name)}">Purge now</button>` : ""}
          ${!del ? `<button class="ghost small-btn" data-act="${a.status === "suspended" ? "resume" : "suspend"}" data-id="${esc(a.app_id)}" data-name="${esc(a.name)}">${a.status === "suspended" ? "Resume" : "Suspend"}</button>` : ""}
          ${!del ? `<button class="ghost small-btn" data-act="rotate" data-id="${esc(a.app_id)}" data-name="${esc(a.name)}">Rotate key</button>` : ""}
          ${!del ? `<button class="danger small-btn" data-act="delete" data-id="${esc(a.app_id)}" data-name="${esc(a.name)}">Delete</button>` : ""}
        </td>`;
      rows.appendChild(tr);
    }
    document.querySelectorAll(".small-btn").forEach((b) => b.addEventListener("click", onAction));
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="6" class="muted">${esc(err.message)}</td></tr>`;
  }
}

let pendingDelete = null;
const dlg = document.getElementById("confirmDel");

function onAction(e) {
  const { act, id, name } = e.target.dataset;
  if (act === "delete") {
    pendingDelete = id;
    document.getElementById("delName").textContent = name;
    dlg.showModal();
    return;
  }
  runAction(act, id, name);
}

async function runAction(act, id, name) {
  try {
    if (act === "rotate") {
      const { api_key } = await api("POST", `/v1/admin/apps/${id}/rotate-key`, {});
      const ok = confirm(`${name}: new API key (shown once — copy now!)\n\n${api_key}`);
      if (!ok) showMsg(msg, "Key rotated (not shown again)", true);
    } else if (act === "suspend") {
      await api("POST", `/v1/admin/apps/${id}/suspend`, {});
      showMsg(msg, `${name} suspended`, true);
    } else if (act === "resume") {
      await api("POST", `/v1/admin/apps/${id}/resume`, {});
      showMsg(msg, `${name} resumed`, true);
    } else if (act === "recover") {
      await api("POST", `/v1/admin/apps/${id}/recover`, {});
      showMsg(msg, `${name} recovered — data intact`, true);
    } else if (act === "force") {
      if (confirm(`Permanently delete ${name} and ALL its tables NOW? This cannot be undone.`)) {
        await api("POST", `/v1/admin/apps/${id}/force-delete`, {});
        showMsg(msg, `${name} permanently deleted`, true);
      }
    }
    loadApps();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
}

document.getElementById("createBtn").addEventListener("click", async () => {
  const input = document.getElementById("newName");
  const btn = document.getElementById("createBtn");
  btn.disabled = true;
  try {
    const app = await api("POST", "/v1/admin/apps", { name: input.value.trim() });
    // navigate to the app page which shows the one-time key
    sessionStorage.setItem("freshKey", app.api_key);
    window.location.href = "app.html?id=" + encodeURIComponent(app.app_id) + "&created=1";
  } catch (err) {
    showMsg(msg, err.message, false);
    btn.disabled = false;
  }
});

document.getElementById("delCancel").addEventListener("click", () => dlg.close());
document.getElementById("delConfirm").addEventListener("click", async () => {
  dlg.close();
  try {
    await api("DELETE", `/v1/admin/apps/${pendingDelete}`, {});
    showMsg(msg, "App marked for deletion — recoverable for 5 minutes", true);
    pendingDelete = null;
    loadApps();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});
document.getElementById("forceConfirm").addEventListener("click", async () => {
  dlg.close();
  try {
    await api("POST", `/v1/admin/apps/${pendingDelete}/force-delete`, {});
    showMsg(msg, "App permanently deleted", true);
    pendingDelete = null;
    loadApps();
  } catch (err) {
    showMsg(msg, err.message, false);
  }
});

document.getElementById("logout").addEventListener("click", logout);

loadApps();