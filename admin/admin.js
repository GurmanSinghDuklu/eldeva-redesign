/* Eldeva product manager: sign in, list, add, edit, reorder and delete products. Talks to server.js at /api. */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const src = p => "../" + p; // product photo paths are relative to the site root
const gbp = v => "£" + (Number.isInteger(v) ? v : v.toFixed(2));

const LABELS = {
  type: { candles: "Candles", diffusers: "Reed diffusers", melts: "Wax melts", gifts: "Gifts", accessories: "Accessories" },
  line: { "": "None", core: "Core scents", bundles: "Bundles" },
  season: { "": "Not seasonal", autumn: "Autumn", winter: "Winter", spring: "Spring", summer: "Summer" },
  mood: { "": "None", "soft-mornings": "Soft Mornings", "hot-summer": "Hot Summer", "sunlit-citrus": "Sunlit Citrus", "golden-cafe": "Golden Cafe" }
};

let products = [], editing = null, snapshot = "", signedIn = false;

/* ---------- api ---------- */
async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET", credentials: "same-origin",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && path !== "/login" && path !== "/me") { showLogin(); throw Object.assign(new Error("Your session ended. Please sign in again."), { quiet: true }); }
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Try again."), { field: data.field });
  return data;
}

/* ---------- toast + confirm ---------- */
let tt;
function toast(msg, bad) {
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("show");
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), bad ? 4200 : 2400);
}
function confirmBox(title, text, yes) {
  const d = $("#confirm"); $("#cfTitle").textContent = title; $("#cfText").textContent = text; $("#cfYes").textContent = yes;
  d.showModal();
  return new Promise(resolve => {
    const done = v => { d.close(); d.removeEventListener("click", onClick); resolve(v); };
    const onClick = e => { const b = e.target.closest("button[value]"); if (b) done(b.value === "yes"); else if (e.target === d) done(false); };
    d.addEventListener("click", onClick);
    d.addEventListener("cancel", e => { e.preventDefault(); done(false); }, { once: true });
  });
}

/* ---------- sign in ---------- */
function showLogin() {
  signedIn = false;
  $("#app").hidden = true; $("#login").hidden = false;
  if ($("#editor").open) $("#editor").close();
  if (!$("#loginForm").contains(document.activeElement)) $("#lu").focus();
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector("button"), err = $("#loginErr");
  err.hidden = true; btn.disabled = true; btn.textContent = "Signing in…";
  try {
    const { user } = await api("/login", { method: "POST", body: { username: f.username.value.trim(), password: f.password.value } });
    f.password.value = ""; start(user);
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  finally { btn.disabled = false; btn.textContent = "Sign in"; }
});
$("#logout").addEventListener("click", async () => { try { await api("/logout", { method: "POST" }); } catch (e) {} showLogin(); });

async function start(user) {
  signedIn = true;
  $("#who").textContent = user; $("#login").hidden = true; $("#app").hidden = false;
  await load();
}
async function load() {
  try { products = await api("/products"); render(); }
  catch (e) { if (!e.quiet) { $("#list").innerHTML = `<li class="empty"><h2>Couldn't load the products</h2><p>${esc(e.message)}</p></li>`; $("#sum").textContent = ""; } }
}

/* ---------- list ---------- */
const fill = (sel, map) => { sel.innerHTML = Object.entries(map).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(""); };
fill($("#fType"), { "": "All categories", ...LABELS.type });
fill($("#f-type"), LABELS.type); fill($("#f-line"), LABELS.line); fill($("#f-season"), LABELS.season); fill($("#f-mood"), LABELS.mood);
$("#q").addEventListener("input", render); $("#fType").addEventListener("change", render);

function render() {
  const q = $("#q").value.trim().toLowerCase(), t = $("#fType").value, filtered = !!(q || t);
  const list = products.filter(p => (!q || p.name.toLowerCase().includes(q)) && (!t || p.type === t));
  const live = products.filter(p => p.visible).length;
  $("#sum").textContent = `${products.length} product${products.length === 1 ? "" : "s"}, ${live} on the website`;
  if (!products.length) { $("#list").innerHTML = `<li class="empty"><h2>No products yet</h2><p>Use “Add a product” to put your first one in the shop.</p></li>`; return; }
  if (!list.length) { $("#list").innerHTML = `<li class="empty"><h2>Nothing matches</h2><p>Try a different name or category.</p></li>`; return; }
  $("#list").innerHTML = list.map(p => {
    const i = products.indexOf(p), b = [];
    if (!p.visible) b.push(`<span class="badge badge--hidden">Hidden</span>`);
    if (p.season) b.push(`<span class="badge">${LABELS.season[p.season]} edit</span>`);
    if (p.line) b.push(`<span class="badge">${LABELS.line[p.line]}</span>`);
    if (p.icon) b.push(`<span class="badge badge--fav">Customer favourite</span>`);
    return `<li class="prow${p.visible ? "" : " is-hidden"}" data-id="${esc(p.id)}">
      <img class="thumb" src="${esc(src(p.img))}" alt="" loading="lazy">
      <div class="pinfo"><button class="pname" type="button" data-edit>${esc(p.name)}</button>
        <p class="pmeta">${esc(LABELS.type[p.type] || p.type)}, ${p.variants.length ? "from " : ""}${gbp(p.price)}${p.variants.length ? `, ${p.variants.length} scents` : ""}</p>
        ${b.length ? `<div class="badges">${b.join("")}</div>` : ""}</div>
      <div class="pact">
        ${filtered ? "" : `<button class="move" type="button" data-move="-1" aria-label="Move ${esc(p.name)} up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="move" type="button" data-move="1" aria-label="Move ${esc(p.name)} down" ${i === products.length - 1 ? "disabled" : ""}>↓</button>`}
        <button class="btn btn--ghost btn--sm" type="button" data-edit>Edit</button>
      </div></li>`;
  }).join("");
}

$("#list").addEventListener("click", async e => {
  const row = e.target.closest(".prow"); if (!row) return;
  const p = products.find(x => x.id === row.dataset.id);
  if (e.target.closest("[data-edit]")) return openEditor(p);
  const mv = e.target.closest("[data-move]");
  if (mv) {
    const i = products.indexOf(p), j = i + Number(mv.dataset.move);
    if (j < 0 || j >= products.length) return;
    [products[i], products[j]] = [products[j], products[i]]; render();
    $(`.prow[data-id="${CSS.escape(p.id)}"] [data-move="${mv.dataset.move}"]`)?.focus();
    try { await api("/products/order", { method: "POST", body: { ids: products.map(x => x.id) } }); }
    catch (ex) { if (!ex.quiet) toast(ex.message, true); load(); }
  }
});

/* ---------- editor ---------- */
const form = $("#edForm"), photos = { img: "", alt: "" };
function setPhoto(key, path) {
  photos[key] = path;
  const box = $(`[data-photo="${key}"] .pvwrap`);
  box.innerHTML = path ? `<img class="pv" src="${esc(src(path))}" alt="">` : `<div class="pv-empty">No photo yet</div>`;
  const clear = $(`[data-photo="${key}"] [data-clear]`); if (clear) clear.hidden = !path;
}
const state = () => JSON.stringify({ ...readForm(), img: photos.img, alt: photos.alt });
function readForm() {
  return {
    name: form.name.value, price: form.price.value.replace(/[£\s,]/g, ""), type: form.type.value, meta: form.meta.value,
    variants: form.variants.value.split("\n").map(s => s.trim()).filter(Boolean),
    line: form.line.value, season: form.season.value, mood: form.mood.value, icon: form.icon.checked, visible: form.visible.checked
  };
}
function clearErrors() { $("#edErr").hidden = true; $$("[data-err]").forEach(el => { el.hidden = true; }); $$("[aria-invalid]", form).forEach(el => el.removeAttribute("aria-invalid")); }
function openEditor(p) {
  editing = p || null; clearErrors();
  $("#edTitle").textContent = p ? "Edit product" : "Add a product";
  $("#delBtn").hidden = !p;
  form.name.value = p?.name || ""; form.price.value = p ? String(p.price) : ""; form.type.value = p?.type || "candles";
  form.meta.value = p?.meta || ""; form.variants.value = (p?.variants || []).join("\n");
  form.line.value = p?.line || ""; form.season.value = p?.season || ""; form.mood.value = p?.mood || "";
  form.icon.checked = !!p?.icon; form.visible.checked = p ? p.visible : true;
  setPhoto("img", p?.img || ""); setPhoto("alt", p?.alt || "");
  snapshot = state();
  $("#editor").showModal();
  $(".sheet-body").scrollTop = 0;
  if (!p) form.name.focus();
}
async function closeEditor() {
  if (state() !== snapshot && !(await confirmBox("Discard your changes?", "You've changed this product but haven't saved it.", "Discard"))) return;
  $("#editor").close();
}
$$("[data-close]").forEach(b => b.addEventListener("click", closeEditor));
$("#editor").addEventListener("cancel", e => { e.preventDefault(); closeEditor(); });
$("#addBtn").addEventListener("click", () => openEditor(null));

// Photos are shrunk in the browser (max 1600px, JPEG) before upload so pages stay quick
async function prepare(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) { throw new Error("This photo can't be read. Please use a JPG or PNG."); }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#FBF8F4"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.86);
}
$$("[data-photo]").forEach(box => {
  const key = box.dataset.photo, input = box.querySelector("input[type=file]"), pick = box.querySelector("[data-pick]");
  pick.addEventListener("click", () => input.click());
  box.querySelector("[data-clear]")?.addEventListener("click", () => setPhoto(key, ""));
  input.addEventListener("change", async () => {
    const file = input.files[0]; input.value = ""; if (!file) return;
    const err = $(`[data-err="${key}"]`); err.hidden = true;
    box.classList.add("busy"); pick.disabled = true; pick.textContent = "Uploading…";
    try {
      const data = await prepare(file);
      const { path } = await api("/upload", { method: "POST", body: { data, name: form.name.value || "photo" } });
      setPhoto(key, path);
    } catch (ex) { if (!ex.quiet) { err.textContent = ex.message; err.hidden = false; } }
    finally { box.classList.remove("busy"); pick.disabled = false; pick.textContent = photos[key] ? "Change photo" : "Choose photo"; }
  });
});

form.addEventListener("submit", async e => {
  e.preventDefault(); clearErrors();
  const body = { ...readForm(), img: photos.img, alt: photos.alt }, btn = $("#saveBtn");
  // quick checks before asking the server
  const local = !body.name.trim() ? ["name", "Give the product a name."] : !/^\d+(\.\d{1,2})?$/.test(body.price) ? ["price", "Enter a price like 30 or 24.99."] : !body.img ? ["img", "Add a main photo."] : null;
  if (local) return showFieldError(...local);
  body.price = Number(body.price);
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const saved = await api(editing ? `/products/${encodeURIComponent(editing.id)}` : "/products", { method: editing ? "PUT" : "POST", body });
    if (editing) products[products.indexOf(editing)] = saved; else products.push(saved);
    snapshot = state(); $("#editor").close(); render();
    toast(editing ? `Saved ${saved.name}` : `Added ${saved.name} to the shop`);
  } catch (ex) { if (!ex.quiet) showFieldError(ex.field, ex.message); }
  finally { btn.disabled = false; btn.textContent = "Save"; }
});
function showFieldError(field, msg) {
  const el = field && $(`[data-err="${field}"]`);
  if (el) {
    el.textContent = msg; el.hidden = false;
    const input = form.elements[field]; if (input && input.setAttribute) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    else el.scrollIntoView({ block: "center", behavior: "smooth" });
  } else { $("#edErr").textContent = msg; $("#edErr").hidden = false; $(".sheet-body").scrollTop = 0; }
}

$("#delBtn").addEventListener("click", async () => {
  if (!editing) return;
  if (!(await confirmBox(`Delete ${editing.name}?`, "It will be removed from the shop straight away. To keep it but take it off the website, untick “Show on the website” instead.", "Delete"))) return;
  try {
    await api(`/products/${encodeURIComponent(editing.id)}`, { method: "DELETE" });
    products = products.filter(p => p !== editing); snapshot = state(); $("#editor").close(); render();
    toast("Product deleted");
  } catch (ex) { if (!ex.quiet) toast(ex.message, true); }
});

addEventListener("beforeunload", e => { if ($("#editor").open && state() !== snapshot) e.preventDefault(); });

/* ---------- boot ---------- */
api("/me").then(d => { if (!signedIn) start(d.user); }).catch(() => { if (!signedIn) showLogin(); });
