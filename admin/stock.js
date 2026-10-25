/* Eldeva stock: how many of each item (and fragrance) you have, what each costs to make, and when to warn.
   Every change saves itself. Sales on the Sell page take items off automatically. */
"use strict";
const DAY = 864e5;
let products = [], stock = {}, sold = {}, show = "";
const keysOf = p => Pricing.stockKeys(p).map(k => k.key);
const sized = p => p.sizes && p.sizes.length > 0;
const hasCost = p => sized(p) ? p.sizes.some(s => typeof Pricing.costFor(stock[p.id], s.id) === "number") : typeof stock[p.id]?.cost === "number";
const total = p => { const lv = stock[p.id]?.levels || {}; const ns = keysOf(p).map(k => lv[k]).filter(n => typeof n === "number"); return ns.length ? ns.reduce((a, b) => a + b, 0) : null; };
const isLow = p => { const r = stock[p.id]; return !!r && keysOf(p).some(k => typeof r.levels?.[k] === "number" && r.levels[k] <= (r.low ?? 3)); };

async function load() {
  try { ({ products, stock } = await api("/stock")); }
  catch (e) { if (!e.quiet) $("#sum").textContent = `Couldn't load stock. ${e.message}`; return; }
  render();
  try { // how fast things sell, for the "about N weeks left" hint
    const { sales } = await api("/sales/all"), since = Date.now() - 30 * DAY;
    sales.filter(s => !s.voided && Date.parse(s.at) >= since).forEach(s => s.lines.forEach(l => { sold[l.productId] = (sold[l.productId] || 0) + l.qty; }));
    $$(".srow").forEach(row => setState(row, ""));
  } catch (e) {}
}

function summary() {
  const counted = products.filter(p => total(p) !== null).length, low = products.filter(isLow).length, nocost = products.filter(p => !hasCost(p)).length;
  $("#sum").textContent = `${counted} of ${products.length} products counted${low ? `, ${low} running low` : ""}${nocost ? `, ${nocost} without a cost` : ""}`;
}
function render() {
  summary();
  const list = products.filter(p => !show || (show === "low" && isLow(p)) || (show === "uncounted" && total(p) === null) || (show === "nocost" && !hasCost(p)));
  if (!list.length) { $("#list").innerHTML = `<li class="empty"><h2>Nothing here</h2><p>${show === "low" ? "Nothing is running low." : "Every product is done."}</p></li>`; return; }
  $("#list").innerHTML = list.map(p => {
    const r = stock[p.id] || {}, lv = r.levels || {};
    return `<li class="srow${sized(p) ? " sized" : ""}" data-id="${esc(p.id)}">
      <img src="${esc(src(p.img))}" alt="" loading="lazy">
      <div class="nm"><b>${esc(p.name)}</b><span>${sized(p) ? p.sizes.map(s => `${esc(s.name)} ${gbp(s.price)}`).join(" · ") : gbp(p.price)}${p.visible ? "" : " · Hidden from the shop"}</span></div>
      ${sized(p) ? "" : `<label class="mini"><span>Costs you</span><span class="money-in"><input class="input input--sm" data-f="cost" inputmode="decimal" value="${typeof r.cost === "number" ? r.cost : ""}" placeholder="–" aria-label="What one ${esc(p.name)} costs you"></span></label>`}
      <label class="mini"><span>Warn at</span><input class="input input--sm" data-f="low" inputmode="numeric" value="${r.low ?? 3}" aria-label="Warn when ${esc(p.name)} gets down to"></label>
      ${sized(p) ? `<div class="levels costs">${p.sizes.map(s => { const c = Pricing.costFor(r, s.id); return `<label class="lvl"><span>${esc(s.name)} costs you</span><span class="money-in"><input class="input input--sm" data-f="scost" data-s="${esc(s.id)}" inputmode="decimal" value="${typeof c === "number" ? c : ""}" placeholder="–" aria-label="What one ${esc(p.name)} ${esc(s.name)} costs you"></span></label>`; }).join("")}</div>` : ""}
      <div class="levels">${Pricing.stockKeys(p).map(({ key: k, label }) => {
        const n = lv[k], low = typeof n === "number" && n <= (r.low ?? 3);
        return `<label class="lvl${low ? " low" : ""}"><span>${label ? esc(label) : "In stock"}${low ? `<small>${n <= 0 ? "None left" : "Running low"}</small>` : ""}</span><input class="input input--sm num" data-f="level" data-k="${esc(k)}" inputmode="numeric" value="${typeof n === "number" ? n : ""}" placeholder="Count" aria-label="${esc(p.name)}${label ? `, ${esc(label)}` : ""}: how many you have"></label>`;
      }).join("")}</div>
      <p class="state" aria-live="polite"></p></li>`;
  }).join("");
  $$(".srow").forEach(row => setState(row, ""));
}
function setState(row, msg, bad) {
  const p = products.find(x => x.id === row.dataset.id), el = $(".state", row);
  if (msg) { el.textContent = msg; el.className = "state" + (bad ? " bad" : " ok"); return; }
  const r = stock[p.id], t = total(p), n = sold[p.id] || 0, bits = [];
  const each = (price, cost) => `${money(price - cost)} profit${price ? ` (${Math.round((price - cost) / price * 100)}%)` : ""}`;
  if (sized(p)) { const ps = p.sizes.map(s => { const c = Pricing.costFor(r, s.id); return typeof c === "number" ? `${s.name} ${each(s.price, c)}` : ""; }).filter(Boolean); if (ps.length) bits.push(ps.join(", ")); }
  else if (typeof r?.cost === "number") bits.push(`${each(p.price, r.cost)} on each`);
  if (n) bits.push(`${n} sold in the last 30 days${t !== null && t > 0 ? `, about ${Math.max(1, Math.round(t / (n / 30) / 7))} week${Math.round(t / (n / 30) / 7) <= 1 ? "" : "s"} left` : ""}`);
  el.textContent = bits.join(" · "); el.className = "state";
}

const timers = new Map();
$("#list").addEventListener("input", e => {
  const row = e.target.closest(".srow"); if (!row) return;
  clearTimeout(timers.get(row)); timers.set(row, setTimeout(() => saveRow(row), 700));
});
$("#list").addEventListener("change", e => { const row = e.target.closest(".srow"); if (row) { clearTimeout(timers.get(row)); saveRow(row); } });
async function saveRow(row) {
  const id = row.dataset.id, levels = {};
  $$("[data-f=level]", row).forEach(i => { levels[i.dataset.k] = i.value.trim(); });
  const costs = {}; $$("[data-f=scost]", row).forEach(i => { costs[i.dataset.s] = i.value.trim().replace(/^£/, ""); });
  const body = { cost: $("[data-f=cost]", row)?.value.trim().replace(/^£/, "") ?? "", costs, low: $("[data-f=low]", row).value.trim() || 3, levels };
  const same = JSON.stringify(body) === row.dataset.last; if (same) return;
  row.dataset.last = JSON.stringify(body);
  setState(row, "Saving…");
  try {
    stock[id] = await api(`/stock/${encodeURIComponent(id)}`, { method: "PUT", body });
    setState(row, "Saved"); setTimeout(() => { if ($(".state", row)?.textContent === "Saved") setState(row, ""); }, 1800);
    summary();
    const r = stock[id];
    $$(".levels:not(.costs) .lvl", row).forEach(l => { const k = $("input", l).dataset.k, n = r.levels[k], low = typeof n === "number" && n <= r.low; l.classList.toggle("low", low); const sm = $("small", l); if (sm) sm.remove(); if (low) $("span", l).insertAdjacentHTML("beforeend", `<small>${n <= 0 ? "None left" : "Running low"}</small>`); });
  } catch (ex) { row.dataset.last = ""; if (!ex.quiet) setState(row, ex.message, true); }
}
$("#show").addEventListener("click", e => {
  const b = e.target.closest("[data-show]"); if (!b) return;
  show = b.dataset.show; $$("#show button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); render();
});

boot(load);
