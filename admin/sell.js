/* Eldeva Sell: take sales at markets and events. Pick the event once, tap products, choose how they paid, save.
   Totals come from pricing.js (the server uses the same file). If the signal drops, sales wait on this
   device and send themselves when it's back. */
"use strict";
const TYPE_LABEL = { candles: "Candles", diffusers: "Reed diffusers", melts: "Wax melts", gifts: "Gifts", accessories: "Accessories" };
const PAY_LABEL = { cash: "Cash", card: "Card", other: "Other" };
const KEEP_EVENT = "eldeva-sell-event", KEEP_OUTBOX = "eldeva-sell-outbox";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const niceDay = iso => new Date(iso + "T12:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: iso.slice(0, 4) === todayISO().slice(0, 4) ? undefined : "numeric" });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let setup = null, ev = null, eventSales = [], cat = "";
let basket = [], dealChoice = "auto", custom = null, payment = "", cashGiven = "", lastSale = null;
let outbox = store.get(KEEP_OUTBOX, []);

async function load() {
  try { setup = await api("/sell/setup"); }
  catch (e) { if (!e.quiet) toast(e.message, true); return; }
  const keep = store.get(KEEP_EVENT, "");
  ev = setup.events.find(e => e.id === keep) || null;
  if (ev) await openEvent(ev); else showChoose();
  renderOutbox(); flush();
}

/* ---------- choosing the event ---------- */
function showChoose() {
  $("#selling").hidden = true; $("#choose").hidden = false;
  const t = todayISO(), list = setup.events;
  const today = list.filter(e => e.date === t), soon = list.filter(e => e.date > t).reverse().slice(0, 4), past = list.filter(e => e.date < t).slice(0, 6);
  const row = (e, tag) => `<button type="button" data-ev="${esc(e.id)}"><b>${esc(e.name)}</b><span>${esc(niceDay(e.date))}${e.location ? ` · ${esc(e.location)}` : ""}</span>${tag ? `<span class="tag chip chip--${tag === "Today" ? "to-send" : "sent"}">${tag}</span>` : ""}</button>`;
  $("#evList").innerHTML = today.map(e => row(e, "Today")).join("") + soon.map(e => row(e, "Coming up")).join("") + past.map(e => row(e, "")).join("")
    || `<p class="help">No events yet. Add today's below.</p>`;
  $("#ne-date").value = t;
}
$("#evList").addEventListener("click", e => { const b = e.target.closest("[data-ev]"); if (b) openEvent(setup.events.find(x => x.id === b.dataset.ev)); });
$("#newEv").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector("button[type=submit]"), err = $("#neErr");
  err.hidden = true; btn.disabled = true;
  try {
    const made = await api("/events", { method: "POST", body: { name: f.name.value, location: f.location.value, date: f.date.value, pitchFee: f.pitchFee.value || 0 } });
    setup.events.unshift(made); f.reset(); openEvent(made);
  } catch (ex) { if (!ex.quiet) { err.textContent = ex.message; err.hidden = false; } }
  finally { btn.disabled = false; }
});
$("#changeEv").addEventListener("click", async () => {
  if (basket.length && !(await confirmBox("Change event?", "The items in this sale will be cleared.", "Change event"))) return;
  clearSale(); showChoose();
});

async function openEvent(e) {
  ev = e; store.set(KEEP_EVENT, e.id);
  $("#choose").hidden = true; $("#selling").hidden = false;
  $("#evName").textContent = e.name;
  $("#evMeta").textContent = `${niceDay(e.date)}${e.location ? ` · ${e.location}` : ""}${e.date !== todayISO() ? " · sales are saved for this date" : ""}`;
  eventSales = [];
  renderCats(); renderGrid(); renderBasket(); renderToday();
  try { eventSales = await api(`/sales?event=${encodeURIComponent(e.id)}`); } catch (ex) { if (!ex.quiet && !(ex instanceof TypeError)) toast(ex.message, true); }
  renderToday();
}

/* ---------- products ---------- */
const product = id => setup.products.find(p => p.id === id);
const level = (p, key) => setup.stock[p.id]?.levels?.[key];
const bkey = (id, size, variant) => `${id}|${size || ""}|${variant}`;
const hasSizes = p => p.sizes && p.sizes.length > 0;
function stockText(p) {
  const known = Pricing.stockKeys(p).map(k => level(p, k.key)).filter(n => typeof n === "number");
  if (!known.length) return { text: "", low: false };
  const n = known.reduce((s, v) => s + v, 0), low = n <= (setup.stock[p.id].low ?? 3);
  return { text: n <= 0 ? "None left" : `${n} left`, low };
}
function renderCats() {
  const types = [...new Set(setup.products.map(p => p.type))];
  $("#cats").innerHTML = [["", "All"], ...types.map(t => [t, TYPE_LABEL[t] || t])].map(([v, l]) => `<button type="button" data-cat="${v}" aria-pressed="${v === cat}">${esc(l)}</button>`).join("");
}
$("#cats").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; cat = b.dataset.cat; renderCats(); renderGrid(); });
function inBasket(id) { return basket.filter(l => l.productId === id).reduce((s, l) => s + l.qty, 0); }
function renderGrid() {
  $("#grid").innerHTML = setup.products.filter(p => !cat || p.type === cat).map(p => {
    const st = stockText(p), n = inBasket(p.id);
    return `<button class="tile" type="button" data-p="${esc(p.id)}" aria-label="Add ${esc(p.name)}, ${gbp(p.price)}${n ? `, ${n} in this sale` : ""}">
      <img src="${esc(src(p.img))}" alt="" loading="lazy">${n ? `<span class="inb">${n}</span>` : ""}
      <b>${esc(p.name)}</b><span class="pr">${hasSizes(p) ? `${p.sizes.length} sizes · from ${gbp(Math.min(...p.sizes.map(s => s.price)))}` : `${p.variants.length ? "Choose fragrance · " : ""}${gbp(p.price)}`}</span>
      ${st.text ? `<span class="st${st.low ? " low" : ""}">${st.text}</span>` : ""}</button>`;
  }).join("");
}
$("#grid").addEventListener("click", e => {
  const t = e.target.closest("[data-p]"); if (!t) return;
  const p = product(t.dataset.p);
  if (p.variants.length || hasSizes(p)) return openPick(p);
  add(p, "", null); bump(p.id);
});
function bump(id) { const t = $(`.tile[data-p="${CSS.escape(id)}"]`); if (t) { t.classList.remove("bump"); void t.offsetWidth; t.classList.add("bump"); } }

/* ---------- fragrance picker ---------- */
// Sizes and fragrances: size buttons on top, a row per fragrance. Sizes only: a row per size. Fragrances only: a row per fragrance.
let picking = null, pickSize = null;
function openPick(p) { picking = p; pickSize = hasSizes(p) ? p.sizes[0] : null; $("#pkTitle").textContent = p.name; renderPick(); $("#pick").showModal(); }
function renderPick() {
  const p = picking, both = hasSizes(p) && p.variants.length;
  $("#pkSizes").hidden = !both;
  if (both) $("#pkSizes").innerHTML = p.sizes.map(s => `<button type="button" data-size="${esc(s.id)}" aria-pressed="${s === pickSize}">${esc(s.name)} · ${gbp(s.price)}</button>`).join("");
  $("#pkHelp").textContent = both ? "Pick the size, then tap + for each fragrance sold." : "Tap + for each one sold.";
  const rows = p.variants.length ? p.variants.map(v => ({ size: pickSize, variant: v, title: v })) : p.sizes.map(s => ({ size: s, variant: "", title: s.name }));
  $("#pkList").innerHTML = rows.map(r => {
    const sid = r.size ? r.size.id : "", l = basket.find(x => x.key === bkey(p.id, sid, r.variant)), n = l ? l.qty : 0, lv = level(p, Pricing.stockKey(sid, r.variant));
    const price = gbp(r.size ? r.size.price : p.price), attrs = `data-s="${esc(sid)}" data-v="${esc(r.variant)}"`;
    return `<li><div><b>${esc(r.title)}</b><span>${typeof lv === "number" ? `${price} · ${lv <= 0 ? "None" : lv} left` : price}</span></div>
      <span class="qty"><button type="button" ${attrs} data-d="-1" aria-label="One less ${esc(r.title)}" ${n ? "" : "disabled"}>−</button><output>${n}</output><button type="button" ${attrs} data-d="1" aria-label="One more ${esc(r.title)}">+</button></span></li>`;
  }).join("");
}
$("#pkSizes").addEventListener("click", e => { const b = e.target.closest("[data-size]"); if (!b) return; pickSize = picking.sizes.find(s => s.id === b.dataset.size); renderPick(); });
$("#pkList").addEventListener("click", e => {
  const b = e.target.closest("[data-d]"); if (!b) return;
  const v = b.dataset.v, sid = b.dataset.s, size = sid ? picking.sizes.find(s => s.id === sid) : null;
  if (b.dataset.d === "1") add(picking, v, size); else change(bkey(picking.id, sid, v), -1);
  renderPick();
  $(`#pkList [data-s="${CSS.escape(sid)}"][data-v="${CSS.escape(v)}"][data-d="${b.dataset.d}"]`)?.focus();
});
$("#pkDone").addEventListener("click", () => { $("#pick").close(); bump(picking.id); });

/* ---------- the basket ---------- */
function add(p, variant, size) {
  const key = bkey(p.id, size && size.id, variant), l = basket.find(x => x.key === key), list = size ? size.price : p.price;
  if (l) l.qty++; else basket.push({ key, productId: p.id, name: p.name, size: size ? size.id : "", sizeName: size ? size.name : "", variant, qty: 1, listPrice: list, price: list, reason: "" });
  lastSale = null; renderBasket(); renderGrid();
}
function change(key, d) {
  const l = basket.find(x => x.key === key); if (!l) return;
  l.qty += d; if (l.qty <= 0) basket = basket.filter(x => x !== l);
  renderBasket(); renderGrid();
}
function clearSale() { basket = []; dealChoice = "auto"; custom = null; payment = ""; cashGiven = ""; renderBasket(); renderGrid(); }
const activeDeal = () => dealChoice === "auto" ? Pricing.bestBundle(setup.deals, basket) : setup.deals.find(d => d.id === dealChoice) || null;

function renderBasket() {
  const items = basket.reduce((s, l) => s + l.qty, 0);
  $("#clearB").hidden = !basket.length;
  if (!basket.length) {
    $("#bBody").innerHTML = `<p class="bempty">Tap a product to add it.</p>`;
    $("#bbar").hidden = true; renderLast(); return;
  }
  const deal = activeDeal(), t = Pricing.price(basket, deal, custom?.amount);
  $("#bBody").innerHTML = `
    <ul class="bl">${basket.map(l => `<li>
      <div class="nm"><b>${esc(l.name)}</b>${l.sizeName || l.variant ? `<span>${esc([l.sizeName, l.variant].filter(Boolean).join(" · "))}</span>` : ""}</div>
      <div class="lt"><button class="lp num" type="button" data-price="${esc(l.key)}" aria-label="Change the price of ${esc(l.name)}">${money(l.price * l.qty)}</button>${l.price !== l.listPrice ? `<span class="was num">${money(l.listPrice * l.qty)}</span><span class="why">${esc(l.reason)}</span>` : ""}</div>
      <span class="qty"><button type="button" data-q="${esc(l.key)}" data-d="-1" aria-label="One less">−</button><output>${l.qty}</output><button type="button" data-q="${esc(l.key)}" data-d="1" aria-label="One more">+</button></span>
      <span class="help">${gbp(l.listPrice)} each</span></li>`).join("")}</ul>
    ${setup.deals.length ? `<div class="deal-row"><label class="lbl" for="dealSel">Deal</label>
      <select class="input" id="dealSel">
        <option value="auto"${dealChoice === "auto" ? " selected" : ""}>Best bundle automatically</option>
        <option value=""${dealChoice === "" ? " selected" : ""}>No deal</option>
        ${setup.deals.map(d => `<option value="${esc(d.id)}"${dealChoice === d.id ? " selected" : ""}>${esc(d.name)} (${esc(Pricing.describe(d))})</option>`).join("")}
      </select>
      <p class="help">${deal ? (t.deal ? `${esc(deal.name)} takes off ${money(t.deal)}.` : `${esc(deal.name)} doesn't apply to these items yet.`) : dealChoice === "auto" ? "No bundle applies yet." : ""}</p></div>` : ""}
    ${custom ? `<div class="disc"><span class="money-in"><input class="input input--sm" id="discAmt" inputmode="decimal" value="${esc(custom.amount || "")}" aria-label="Discount amount"></span>
      <input class="input input--sm" id="discWhy" maxlength="60" placeholder="Why, for example “regular customer”" value="${esc(custom.reason)}" aria-label="Reason for the discount">
      <button class="linkbtn" type="button" id="discOff">Remove</button></div>` : `<p style="margin-top:12px"><button class="linkbtn" type="button" id="discOn">Add a discount</button></p>`}
    <dl class="totals num">
      ${t.changed > 0 ? `<dt>Full price</dt><dd>${money(t.listTotal)}</dd><dt>Price changes</dt><dd>−${money(t.changed)}</dd>` : `<dt>${items} item${items === 1 ? "" : "s"}</dt><dd>${money(t.subtotal)}</dd>`}
      ${t.deal ? `<dt>${esc(deal.name)}</dt><dd>−${money(t.deal)}</dd>` : ""}
      ${t.custom ? `<dt>Discount</dt><dd>−${money(t.custom)}</dd>` : ""}
      <dt class="grand">To pay</dt><dd class="grand">${money(t.total)}</dd>
    </dl>
    <div class="pay" role="group" aria-label="How they paid">${Object.entries(PAY_LABEL).map(([k, v]) => `<button type="button" data-pay="${k}" aria-pressed="${payment === k}">${v}</button>`).join("")}</div>
    ${payment === "cash" ? `<div class="cash"><span class="money-in"><input class="input input--sm" id="cashIn" inputmode="decimal" placeholder="Cash handed over" value="${esc(cashGiven)}" aria-label="Cash handed over"></span><span class="change num" id="changeOut"></span></div>` : ""}
    <button class="btn save" type="button" id="saveSale" ${payment ? "" : "disabled"}>${payment ? `Save ${money(t.total)} sale` : "Choose how they paid"}</button>`;
  updateChange(t.total);
  $("#bbarText").textContent = `${items} item${items === 1 ? "" : "s"} · ${money(t.total)}`;
  $("#bbar").hidden = false;
  renderLast();
}
function updateChange(total) {
  const out = $("#changeOut"); if (!out) return;
  const given = Number(String(cashGiven).replace(/[£,\s]/g, ""));
  out.textContent = !cashGiven ? "" : !Number.isFinite(given) ? "" : given < total ? `${money(total - given)} short` : `Change ${money(given - total)}`;
  out.className = "change num" + (given < total ? " bad" : "");
}

$("#bBody").addEventListener("click", e => {
  const q = e.target.closest("[data-q]"); if (q) return change(q.dataset.q, Number(q.dataset.d));
  const pr = e.target.closest("[data-price]"); if (pr) return openPrice(pr.dataset.price);
  const pay = e.target.closest("[data-pay]"); if (pay) { payment = pay.dataset.pay; renderBasket(); if (payment === "cash") $("#cashIn")?.focus(); else $("#saveSale").focus(); return; }
  if (e.target.id === "discOn") { custom = { amount: "", reason: "" }; renderBasket(); $("#discAmt").focus(); }
  if (e.target.id === "discOff") { custom = null; renderBasket(); }
  if (e.target.id === "saveSale") save();
});
$("#bBody").addEventListener("change", e => {
  if (e.target.id === "dealSel") { dealChoice = e.target.value; renderBasket(); }
  if (e.target.id === "discAmt") { const n = Number(e.target.value.replace(/[£,\s]/g, "")); custom.amount = Number.isFinite(n) && n > 0 ? n : ""; renderBasket(); }
});
$("#bBody").addEventListener("input", e => {
  if (e.target.id === "discWhy") custom.reason = e.target.value;
  if (e.target.id === "cashIn") { cashGiven = e.target.value; updateChange(Pricing.price(basket, activeDeal(), custom?.amount).total); }
});
$("#clearB").addEventListener("click", clearSale);

/* ---------- changing a price ---------- */
let pricing = null;
function openPrice(key) {
  pricing = basket.find(l => l.key === key);
  $("#prText").textContent = `${[pricing.name, pricing.sizeName, pricing.variant].filter(Boolean).join(", ")}. Full price ${gbp(pricing.listPrice)} each.`;
  $("#prVal").value = String(pricing.price); $("#prErr").hidden = true;
  $$("#prWhy button").forEach(b => b.setAttribute("aria-pressed", String(b.textContent === pricing.reason)));
  $("#priceDlg").showModal(); $("#prVal").select();
}
$("#prWhy").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const on = b.getAttribute("aria-pressed") !== "true"; $$("#prWhy button").forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", String(on)); });
$("#priceForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("#prVal").value.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) { $("#prErr").textContent = "Enter a price like 25 or 7.50."; $("#prErr").hidden = false; return; }
  pricing.price = Number(v);
  pricing.reason = pricing.price === pricing.listPrice ? "" : $("#prWhy [aria-pressed=true]")?.textContent || "Price changed";
  $("#priceDlg").close(); renderBasket();
});
$("#prReset").addEventListener("click", () => { pricing.price = pricing.listPrice; pricing.reason = ""; $("#priceDlg").close(); renderBasket(); });

/* ---------- saving ---------- */
async function save() {
  const btn = $("#saveSale"), deal = activeDeal(), t = Pricing.price(basket, deal, custom?.amount);
  const body = {
    clientId: uid(), eventId: ev.id, payment, note: "",
    lines: basket.map(l => ({ productId: l.productId, size: l.size, variant: l.variant, qty: l.qty, price: l.price, reason: l.reason })),
    dealId: deal && t.deal ? deal.id : "", custom: custom && t.custom ? { amount: custom.amount, reason: custom.reason } : null,
    cashGiven: payment === "cash" ? cashGiven : ""
  };
  btn.disabled = true; btn.textContent = "Saving…";
  const local = { ...body, id: "", date: ev.date, at: new Date().toISOString(), totals: t, lines: basket.map(l => ({ ...l })), pending: true, voided: false };
  try {
    const sale = await api("/sales", { method: "POST", body });
    eventSales.push(sale); lastSale = sale; moveLocal(sale.lines, 1);
    toast(`Saved ${money(sale.totals.total)} sale`);
  } catch (ex) {
    if (ex instanceof TypeError) { // no connection: keep it here and send it later
      outbox.push(body); store.set(KEEP_OUTBOX, outbox);
      eventSales.push(local); lastSale = local; moveLocal(local.lines, 1);
      toast("No signal. The sale is kept on this device and will send itself."); renderOutbox();
    } else { if (!ex.quiet) toast(ex.message, true); btn.disabled = false; btn.textContent = `Save ${money(t.total)} sale`; return; }
  }
  basket = []; dealChoice = "auto"; custom = null; payment = ""; cashGiven = "";
  closeBasket(); renderBasket(); renderGrid(); renderToday();
}
function moveLocal(lines, sign) {
  for (const l of lines) { const r = setup.stock[l.productId], k = Pricing.stockKey(l.size, l.variant); if (r?.levels && typeof r.levels[k] === "number") r.levels[k] -= sign * l.qty; }
}
function renderLast() {
  const s = lastSale;
  $("#last").innerHTML = s && !basket.length ? `<div class="lastsale"><span>Last sale <b class="num">${money(s.totals.total)}</b>, ${PAY_LABEL[s.payment].toLowerCase()}${s.pending ? " (waiting for signal)" : ""}</span><button class="btn btn--ghost btn--sm" type="button" id="undoLast">Undo</button></div>` : "";
}
$("#last").addEventListener("click", e => { if (e.target.id === "undoLast") undo(lastSale); });
async function undo(s) {
  if (!(await confirmBox("Undo this sale?", `${money(s.totals.total)} will come off today's takings and the items go back into stock.`, "Undo sale"))) return;
  if (s.pending) {
    outbox = outbox.filter(b => b.clientId !== s.clientId); store.set(KEEP_OUTBOX, outbox);
    eventSales = eventSales.filter(x => x !== s);
  } else {
    try { Object.assign(s, await api(`/sales/${s.id}/void`, { method: "POST" })); }
    catch (ex) { if (!ex.quiet) toast(ex instanceof TypeError ? "No signal. Try undoing again in a moment." : ex.message, true); return; }
  }
  moveLocal(s.lines, -1);
  if (lastSale === s) lastSale = null;
  toast("Sale undone"); renderBasket(); renderGrid(); renderToday(); if ($("#today").open) renderTodaySheet();
}

/* ---------- waiting sales ---------- */
let flushing = false;
async function flush() {
  if (flushing || !outbox.length) return;
  flushing = true;
  try {
    while (outbox.length) {
      const body = outbox[0];
      try {
        const sale = await api("/sales", { method: "POST", body });
        const i = eventSales.findIndex(s => s.pending && s.clientId === body.clientId);
        if (i >= 0) { if (lastSale === eventSales[i]) lastSale = sale; eventSales[i] = sale; }
        outbox.shift(); store.set(KEEP_OUTBOX, outbox);
      } catch (ex) {
        if (ex instanceof TypeError || ex.quiet) break; // still offline, or signed out: try later
        body.error = ex.message; store.set(KEEP_OUTBOX, outbox); break;
      }
    }
  } finally { flushing = false; renderOutbox(); renderToday(); renderLast(); }
}
function renderOutbox() {
  const box = $("#outbox"), bad = outbox.find(b => b.error);
  box.hidden = !outbox.length;
  if (!outbox.length) return;
  box.innerHTML = bad
    ? `<span>A sale couldn't be saved: ${esc(bad.error)}</span><button class="btn btn--ghost btn--sm" type="button" id="dropBad" style="margin-left:auto">Remove it</button>`
    : `<span>${outbox.length} sale${outbox.length === 1 ? " is" : "s are"} waiting for signal and will send automatically.</span><button class="btn btn--ghost btn--sm" type="button" id="retry" style="margin-left:auto">Try now</button>`;
}
$("#outbox").addEventListener("click", async e => {
  if (e.target.id === "retry") flush();
  if (e.target.id === "dropBad" && await confirmBox("Remove this sale?", "It couldn't be saved, so it isn't in your takings or stock. Enter it again if you need to.", "Remove")) {
    const bad = outbox.find(b => b.error); outbox = outbox.filter(b => b !== bad); store.set(KEEP_OUTBOX, outbox);
    eventSales = eventSales.filter(s => !(s.pending && s.clientId === bad.clientId)); renderOutbox(); renderToday();
    flush();
  }
});
addEventListener("online", flush);
setInterval(flush, 20000);

/* ---------- today's sales and cash up ---------- */
const live = () => eventSales.filter(s => !s.voided);
function byPay() { const t = { cash: 0, card: 0, other: 0 }; live().forEach(s => { t[s.payment] += s.totals.total; }); return t; }
function renderToday() {
  if (!ev) return;
  const l = live(), total = l.reduce((s, x) => s + x.totals.total, 0);
  $("#evToday").innerHTML = `<b class="num">${l.length}</b> sale${l.length === 1 ? "" : "s"} · <b class="num">${money(total)}</b>`;
}
$("#todayBtn").addEventListener("click", () => { renderTodaySheet(); $("#today").showModal(); });
function renderTodaySheet() {
  const p = byPay(), l = live(), cu = ev.cashUp;
  $("#tdSub").textContent = `${ev.name}, ${niceDay(ev.date)}`;
  $("#tdBody").innerHTML = `
    <h3>Takings</h3>
    <dl class="num"><dt>Cash</dt><dd>${money(p.cash)}</dd><dt>Card</dt><dd>${money(p.card)}</dd>${p.other ? `<dt>Other</dt><dd>${money(p.other)}</dd>` : ""}
      <dt><b>Total from ${l.length} sale${l.length === 1 ? "" : "s"}</b></dt><dd><b>${money(p.cash + p.card + p.other)}</b></dd></dl>
    <h3>Cash up</h3>
    <div class="row2">
      <div class="field"><label for="cuFloat">Float you started with</label><span class="money-in"><input class="input" id="cuFloat" inputmode="decimal" value="${cu ? cu.float : ""}" placeholder="0"></span></div>
      <div class="field"><label for="cuCount">Cash counted now</label><span class="money-in"><input class="input" id="cuCount" inputmode="decimal" value="${cu ? cu.counted : ""}"></span></div>
    </div>
    <p id="cuResult" class="help" style="margin:-4px 0 22px"></p>
    <h3>Every sale</h3>
    ${eventSales.length ? `<ul class="slist">${eventSales.slice().reverse().map((s, i) => `<li class="${s.voided ? "void" : ""}"><div>${esc(itemSummary(s.lines))}<small>${esc(clock(new Date(s.at)))} · ${PAY_LABEL[s.payment]}${s.by ? ` · ${esc(s.by)}` : ""}${s.deal ? ` · ${esc(s.deal.name)}` : ""}${s.pending ? " · waiting for signal" : ""}${s.voided ? " · undone" : ""}</small></div>
      <span class="amt num">${money(s.totals.total)}</span>${s.voided ? "<span></span>" : `<button class="btn btn--ghost btn--sm" type="button" data-undo="${eventSales.length - 1 - i}">Undo</button>`}</li>`).join("")}</ul>` : `<p class="help">No sales yet.</p>`}`;
  cashResult();
}
function cashResult() {
  const n = id => { const v = Number(($(id)?.value || "").replace(/[£,\s]/g, "")); return Number.isFinite(v) ? v : 0; };
  const expected = n("#cuFloat") + byPay().cash, counted = $("#cuCount").value.trim() ? n("#cuCount") : null, out = $("#cuResult");
  if (counted === null) { out.textContent = `You should have ${money(expected)} in cash.`; out.className = "help"; return; }
  const diff = Pricing.r2(counted - expected);
  out.textContent = diff === 0 ? `Spot on: ${money(expected)}.` : `You should have ${money(expected)}. That's ${money(Math.abs(diff))} ${diff > 0 ? "over" : "short"}.`;
  out.className = diff === 0 ? "help ok" : "help bad";
}
$("#tdBody").addEventListener("input", e => { if (e.target.id === "cuFloat" || e.target.id === "cuCount") cashResult(); });
$("#tdBody").addEventListener("click", e => { const b = e.target.closest("[data-undo]"); if (b) undo(eventSales[Number(b.dataset.undo)]); });
$("#cuSave").addEventListener("click", async () => {
  const float = $("#cuFloat").value.trim() || "0", counted = $("#cuCount").value.trim();
  if (!counted) { toast("Count the cash first, then save.", true); return $("#cuCount").focus(); }
  try { ev = Object.assign(ev, await api(`/events/${ev.id}/cashup`, { method: "PUT", body: { float, counted } })); toast("Cash up saved"); $("#today").close(); }
  catch (ex) { if (!ex.quiet) toast(ex instanceof TypeError ? "No signal. Try saving the cash up again in a moment." : ex.message, true); }
});
$("#today [data-close]").addEventListener("click", () => $("#today").close());

/* ---------- basket as a sheet on phones ---------- */
function openBasket() { $("#basket").classList.add("open"); $("#scrim").classList.add("open"); $("#bTitle").setAttribute("tabindex", "-1"); $("#bTitle").focus(); }
function closeBasket() { $("#basket").classList.remove("open"); $("#scrim").classList.remove("open"); }
$("#bbar").addEventListener("click", openBasket);
$("#closeB").addEventListener("click", closeBasket);
$("#scrim").addEventListener("click", closeBasket);
addEventListener("keydown", e => { if (e.key === "Escape" && $("#basket").classList.contains("open") && !$$("dialog[open]").length) closeBasket(); });
addEventListener("beforeunload", e => { if (basket.length) e.preventDefault(); });

boot(load);
