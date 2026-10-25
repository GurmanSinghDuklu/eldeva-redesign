/* Shared by every admin page: helpers, the /api wrapper, toast, confirm box and sign in.
   Each page calls boot(onSignedIn) once its own script has loaded. */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const src = p => "../" + p; // photo paths are relative to the site root
const gbp = v => "£" + (Number.isInteger(v) ? v : v.toFixed(2));
const money = v => "£" + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let signedIn = false, onSignedIn = null;

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
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), bad ? 4200 : 2600);
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
  $$("dialog[open]").forEach(d => d.close());
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
  $("#who").textContent = user; $("#logout").title = `Signed in as ${user}`; $("#login").hidden = true; $("#app").hidden = false;
  await onSignedIn(user);
}
function boot(fn) {
  onSignedIn = fn;
  api("/me").then(d => { if (!signedIn) start(d.user); }).catch(() => { if (!signedIn) showLogin(); });
}

/* ---------- order helpers (Overview + Orders) ---------- */
const STATUS = { "to-send": "To send", sent: "With Royal Mail", posted: "Posted" };
const chip = s => `<span class="chip chip--${s}">${STATUS[s]}</span>`;
const itemLine = l => `${l.name}${l.sizeName ? ` ${l.sizeName}` : ""}${l.variant ? ` (${l.variant})` : ""}${l.qty > 1 ? ` × ${l.qty}` : ""}`;
const itemSummary = items => items.map(itemLine).join(", ");
const dayStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const clock = d => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
function when(iso) { // "12 minutes ago", "Today, 14:05", "Yesterday, 09:12", "Mon 13 Oct"
  const d = new Date(iso), mins = Math.round((Date.now() - d) / 60e3), days = Math.round((dayStart() - dayStart(d)) / 864e5);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  if (days === 0) return `Today, ${clock(d)}`;
  if (days === 1) return `Yesterday, ${clock(d)}`;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
const fullDate = iso => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
