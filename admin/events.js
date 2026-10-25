/* Eldeva events dashboard: takings, events, best sellers, fragrances through the year, deals, payments and
   stock to watch, all filtered by date, event, location, product and fragrance. Also where events and deals
   are added and edited. The figures are added up here from every sale, so changing a filter is instant. */
"use strict";
const DAY = 864e5, MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAY_LABEL = { cash: "Cash", card: "Card", other: "Other" };
let D = null, gran = "month";
const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const niceDay = s => new Date(s + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const plural = (n, w) => `${n.toLocaleString("en-GB")} ${w}${n === 1 ? "" : "s"}`;
// candles and diffusers are named after their fragrance; melts and sets carry it as the option picked
const scentOf = l => l.variant || (l.type === "candles" || l.type === "diffusers" ? l.name : "");

async function load() {
  try { D = await api("/sales/all"); }
  catch (e) { if (!e.quiet) $("#sum").textContent = `Couldn't load your sales. ${e.message}`; return; }
  fillFilters(); render();
}

/* ---------- filters ---------- */
function fillFilters() {
  const keep = id => $(id).value;
  const opts = (id, first, list) => { const v = keep(id); $(id).innerHTML = `<option value="">${first}</option>` + list.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join(""); if ([...$(id).options].some(o => o.value === v)) $(id).value = v; };
  opts("#fEvent", "All events", D.events.slice().sort((a, b) => b.date.localeCompare(a.date)).map(e => [e.id, `${e.name}, ${niceDay(e.date)}`]));
  opts("#fLoc", "All locations", [...new Set(D.events.map(e => e.location).filter(Boolean))].sort().map(l => [l, l]));
  opts("#fProd", "All products", D.products.map(p => [p.id, p.name]));
  const scents = new Set(); D.products.forEach(p => { p.variants.forEach(v => scents.add(v)); if (p.type === "candles" || p.type === "diffusers") scents.add(p.name); });
  opts("#fScent", "All fragrances", [...scents].sort().map(s => [s, s]));
}
$$(".filters select").forEach(s => s.addEventListener("change", render));
function rangeStart() {
  const now = new Date(), v = $("#fRange").value;
  if (v === "month") return iso(new Date(now.getFullYear(), now.getMonth(), 1));
  if (v === "3m") return iso(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate() + 1));
  if (v === "year") return `${now.getFullYear()}-01-01`;
  if (v === "12m") return iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1));
  return "";
}

/* ---------- adding up ---------- */
// Each line gets its share of the sale's deal and discount, so product and fragrance figures add up to the takings.
function scope() {
  const from = rangeStart(), evId = $("#fEvent").value, loc = $("#fLoc").value, prod = $("#fProd").value, scent = $("#fScent").value;
  const evById = Object.fromEntries(D.events.map(e => [e.id, e]));
  const sales = [], lines = [];
  for (const s of D.sales) {
    if (s.voided || (from && s.date < from)) continue;
    const ev = evById[s.eventId];
    if (evId && s.eventId !== evId) continue;
    if (loc && ev?.location !== loc) continue;
    const off = s.totals.deal + s.totals.custom, sub = s.totals.subtotal || 1;
    const ls = s.lines.map(l => ({ ...l, sale: s, ev, scent: scentOf(l), gross: l.qty * l.price, net: l.qty * l.price - off * (l.qty * l.price / sub) }))
      .filter(l => (!prod || l.productId === prod) && (!scent || l.scent === scent));
    if (!ls.length) continue;
    sales.push({ s, ev, net: ls.reduce((a, l) => a + l.net, 0), lines: ls }); lines.push(...ls);
  }
  return { sales, lines, partial: !!(prod || scent), from };
}
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
function costOf(lines) { const known = lines.filter(l => typeof l.cost === "number"); return { cost: sum(known, l => l.qty * l.cost), missing: lines.length - known.length }; }

function render() {
  const live = D.sales.filter(s => !s.voided);
  $("#none").hidden = !!live.length; $("#dash").hidden = !live.length;
  $("#sum").textContent = live.length ? `${plural(D.events.length, "event")}, ${plural(live.length, "sale")} recorded` : `${plural(D.events.length, "event")} so far`;
  if (!live.length) return;
  const S = scope();
  const bits = [];
  if (S.partial) bits.push("Showing only the chosen product or fragrance, so pitch fees aren't taken off.");
  if (!S.sales.length) bits.push("Nothing matches these filters.");
  $("#fnote").textContent = bits.join(" ");
  renderKpis(S); renderChart(S); renderEvents(S); renderBest(S); renderHeat(S); renderDeals(S); renderPays(S); renderLow();
}

/* ---------- headline figures ---------- */
function renderKpis(S) {
  const takings = sum(S.sales, x => x.net), units = sum(S.lines, l => l.qty), { cost, missing } = costOf(S.lines);
  const given = sum(S.sales, x => x.s.totals.deal + x.s.totals.custom + (x.s.totals.changed || 0));
  const profit = takings - cost;
  const tile = (label, val, sub) => `<div class="card stat"><p class="lbl">${label}</p><p class="val num">${val}</p><p class="sub">${sub}</p></div>`;
  $("#kpis").innerHTML =
    tile("Takings", money(takings), S.partial ? "From the chosen items" : "After deals and discounts") +
    tile("Sales", S.sales.length.toLocaleString("en-GB"), `${plural(new Set(S.sales.map(x => x.s.eventId)).size, "event")}`) +
    tile("Items sold", units.toLocaleString("en-GB"), S.sales.length ? `${(units / S.sales.length).toFixed(1)} per sale` : "") +
    tile("Average sale", S.sales.length ? money(takings / S.sales.length) : "–", "") +
    tile("Gross profit", money(profit), missing ? `<b>${missing}</b> line${missing === 1 ? " has" : "s have"} no cost yet. <a href="stock.html">Add costs</a>` : `${pct(profit, takings)}% of takings, before pitch fees`) +
    tile("Discounts given", money(given), takings ? `${pct(given, takings + given)}% off full price` : "");
}

/* ---------- takings chart ---------- */
function periodKey(dateStr) {
  if (gran === "day") return dateStr;
  if (gran === "month") return dateStr.slice(0, 7);
  if (gran === "year") return dateStr.slice(0, 4);
  const d = new Date(dateStr + "T12:00"); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); // week starts Monday
}
function nextPeriod(k) {
  if (gran === "year") return String(Number(k) + 1);
  if (gran === "month") { const [y, m] = k.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
  const d = new Date(k + "T12:00"); d.setDate(d.getDate() + (gran === "week" ? 7 : 1)); return iso(d);
}
function label(k, short) {
  if (gran === "year") return k;
  if (gran === "month") { const [y, m] = k.split("-"); return short ? MONTHS[m - 1] + (y !== String(new Date().getFullYear()) ? ` ${y.slice(2)}` : "") : `${MONTHS[m - 1]} ${y}`; }
  const d = new Date(k + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return gran === "week" ? (short ? d : `Week of ${d}`) : d;
}
let series = [], geo = null, hoverAt = -1;
function renderChart(S) {
  const dates = S.sales.map(x => x.s.date).sort();
  series = [];
  if (dates.length) {
    const start = periodKey(S.from && S.from < dates[0] ? S.from : dates[0]), end = periodKey(iso(new Date()) > dates[dates.length - 1] ? iso(new Date()) : dates[dates.length - 1]);
    const by = {};
    S.sales.forEach(x => { const k = periodKey(x.s.date); (by[k] ||= { total: 0, count: 0 }); by[k].total += x.net; by[k].count++; });
    for (let k = start, guard = 0; k <= end && guard < 1200; k = nextPeriod(k), guard++) series.push({ k, total: by[k]?.total || 0, count: by[k]?.count || 0 });
  }
  const best = series.reduce((a, b) => (b.total > (a?.total ?? -1) ? b : a), null);
  $("#cSum").textContent = best && best.total ? `Best ${gran}: ${label(best.k)}, ${money(best.total)}.` : "";
  $("#cTable").innerHTML = `<table><thead><tr><th>${gran[0].toUpperCase() + gran.slice(1)}</th><th>Sales</th><th>Takings</th></tr></thead><tbody>${series.slice().reverse().filter(p => p.count).map(p => `<tr><td>${esc(label(p.k))}</td><td class="num">${p.count}</td><td class="num">${money(p.total)}</td></tr>`).join("")}</tbody></table>`;
  draw();
}
function draw() {
  const box = $("#plot"), W = box.clientWidth, H = box.clientHeight;
  if (!W) return;
  if (!series.length) { box.innerHTML = ""; return; }
  const pad = { l: 52, r: 8, t: 12, b: 28 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, n = series.length;
  const max = Math.max(...series.map(d => d.total), 1), step = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000].find(s => max / s <= 5) || 25000, top = Math.ceil(max / step) * step;
  const slot = iw / n, bw = Math.max(1, Math.min(48, slot - 2)), x = i => pad.l + i * slot + (slot - bw) / 2, y = v => pad.t + ih - (v / top) * ih;
  geo = { pad, slot, W, x, y, bw };
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  const every = Math.ceil(n / Math.max(2, Math.floor(iw / 70)));
  const xl = series.map((d, i) => i % every === 0 ? `<text x="${x(i) + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(label(d.k, true))}</text>` : "").join("");
  // bars keep 4px rounded tops and sit flat on the baseline
  const r = Math.min(4, bw / 2);
  const bar = (d, i) => { if (!d.total) return ""; const x0 = x(i), y0 = y(d.total), h = pad.t + ih - y0; return `<path class="bar" data-i="${i}" d="M${x0},${y0 + h}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y0 + h}Z"/>`; };
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart of takings by ${gran}. ${esc($("#cSum").textContent)} The table below lists every figure.">
    <g class="grid">${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 10}" y="${y(v) + 4}" text-anchor="end">£${v.toLocaleString("en-GB")}</text>`).join("")}</g>
    <g class="xaxis">${xl}</g><g class="draw">${series.map(bar).join("")}</g>
    <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" aria-hidden="true"></div>`;
  if (!box.classList.contains("in")) new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { box.classList.add("in"); io.disconnect(); setTimeout(() => box.classList.add("done"), 800); } }, { threshold: .3 }).observe(box);
  if (hoverAt >= 0 && hoverAt < n) show(hoverAt); else hoverAt = -1;
}
function show(i) {
  const box = $("#plot"), d = series[i]; if (!d || !geo) return;
  hoverAt = i;
  $$(".bar", box).forEach(b => b.classList.toggle("dim", Number(b.dataset.i) !== i));
  const tip = $(".tip", box);
  tip.innerHTML = `<b>${money(d.total)}</b>${esc(label(d.k))} · ${plural(d.count, "sale")}`;
  const cx = geo.x(i) + geo.bw / 2, cy = geo.y(d.total), half = tip.offsetWidth / 2 + 4, left = Math.min(Math.max(cx, half), geo.W - half);
  tip.style.transform = `translate(${left - tip.offsetWidth / 2}px, ${Math.max(0, cy - tip.offsetHeight - 12)}px)`;
  box.classList.add("on");
}
function hide() { hoverAt = -1; const box = $("#plot"); box.classList.remove("on"); $$(".bar", box).forEach(b => b.classList.remove("dim")); }
const plot = $("#plot"); plot.tabIndex = 0;
plot.addEventListener("pointermove", e => { if (!geo || !series.length) return; const r = plot.getBoundingClientRect(); show(Math.min(series.length - 1, Math.max(0, Math.floor((e.clientX - r.left - geo.pad.l) / geo.slot)))); });
plot.addEventListener("pointerleave", hide); plot.addEventListener("blur", hide);
plot.addEventListener("keydown", e => {
  const k = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (!k || !series.length) return;
  e.preventDefault(); show(Math.min(series.length - 1, Math.max(0, (hoverAt < 0 ? series.length : hoverAt) + k)));
});
new ResizeObserver(() => draw()).observe(plot);
$("#gran").addEventListener("click", e => {
  const b = e.target.closest("[data-g]"); if (!b) return;
  gran = b.dataset.g; $$("#gran button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); hoverAt = -1; renderChart(scope());
});

/* ---------- event by event ---------- */
function renderEvents(S) {
  const by = new Map();
  S.sales.forEach(x => { if (!by.has(x.s.eventId)) by.set(x.s.eventId, []); by.get(x.s.eventId).push(x); });
  const rows = [...by.entries()].map(([id, xs]) => {
    const ev = xs[0].ev || { name: "Deleted event", date: xs[0].s.date, location: "" }, lines = xs.flatMap(x => x.lines);
    const takings = sum(xs, x => x.net), { cost, missing } = costOf(lines), fees = S.partial ? 0 : (ev.pitchFee || 0) + (ev.otherCosts || 0);
    return { id, ev, takings, sales: xs.length, units: sum(lines, l => l.qty), cost, missing, fees, profit: takings - cost - fees };
  }).sort((a, b) => b.ev.date.localeCompare(a.ev.date));
  if (!rows.length) { $("#evTable").innerHTML = `<p class="help">No events match these filters.</p>`; return; }
  $("#evTable").innerHTML = `<table class="tbl"><thead><tr><th>Event</th><th>Date</th><th class="r">Takings</th><th class="r">Sales</th><th class="r">Items</th><th class="r">Average</th><th class="r">Item costs</th><th class="r">Pitch &amp; costs</th><th class="r">Profit</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-ev="${esc(r.id)}" tabindex="0"><td><b>${esc(r.ev.name)}</b>${r.ev.location ? `<small>${esc(r.ev.location)}</small>` : ""}</td><td>${esc(niceDay(r.ev.date))}</td>
      <td class="r num">${money(r.takings)}</td><td class="r num">${r.sales}</td><td class="r num">${r.units}</td><td class="r num">${money(r.takings / r.sales)}</td>
      <td class="r num">${money(r.cost)}${r.missing ? `<small title="Some items have no cost yet"> *</small>` : ""}</td><td class="r num">${S.partial ? "–" : money(r.fees)}</td>
      <td class="r num ${r.profit < 0 ? "bad" : ""}"><b style="font:600 14px var(--sans)">${money(r.profit)}</b></td></tr>`).join("")}</tbody></table>
    ${rows.some(r => r.missing) ? `<p class="help" style="margin-top:10px">* Some items have no cost yet, so profit is higher than it really is. <a href="stock.html">Add costs on the Stock page.</a></p>` : ""}`;
}
$("#evTable").addEventListener("click", e => { const tr = e.target.closest("[data-ev]"); if (tr) { $("#fEvent").value = tr.dataset.ev; render(); scrollTo({ top: 0, behavior: "smooth" }); } });
$("#evTable").addEventListener("keydown", e => { if (e.key === "Enter") e.target.closest("[data-ev]")?.click(); });

/* ---------- what sells ---------- */
function bars(el, rows, fmt) {
  const max = Math.max(...rows.map(r => r.v), 1);
  el.innerHTML = rows.length ? rows.map(r => `<li><span>${esc(r.name)}</span><span class="num">${fmt(r)}</span><span class="t"><i style="transform:scaleX(${(r.v / max).toFixed(3)})"></i></span></li>`).join("") : `<li class="help">Nothing to show yet.</li>`;
}
function tally(lines, key) {
  const m = new Map();
  lines.forEach(l => { const k = key(l); if (!k) return; const r = m.get(k) || { name: k, v: 0, money: 0 }; r.v += l.qty; r.money += l.net; m.set(k, r); });
  return [...m.values()].sort((a, b) => b.v - a.v || b.money - a.money);
}
function renderBest(S) {
  const fmt = r => `${r.v} <small>· ${money(r.money)}</small>`;
  bars($("#bestP"), tally(S.lines, l => l.sizeName ? `${l.name} ${l.sizeName}` : l.name).slice(0, 10), fmt);
  bars($("#bestF"), tally(S.lines, l => l.scent).slice(0, 10), fmt);
}
function renderHeat(S) {
  const top = tally(S.lines, l => l.scent).slice(0, 8).map(r => r.name);
  if (!top.length) { $("#heat").innerHTML = `<p class="help">Nothing to show yet.</p>`; return; }
  const grid = top.map(() => Array(12).fill(0));
  S.lines.forEach(l => { const r = top.indexOf(l.scent); if (r >= 0) grid[r][Number(l.sale.date.slice(5, 7)) - 1] += l.qty; });
  const max = Math.max(...grid.flat(), 1);
  $("#heat").innerHTML = `<table class="heat" style="min-width:560px"><thead><tr><th>Fragrance</th>${MONTHS.map(m => `<th>${m}</th>`).join("")}</tr></thead><tbody>
    ${top.map((name, r) => `<tr><th title="${esc(name)}">${esc(name)}</th>${grid[r].map((v, c) => {
      const a = v ? .12 + .78 * v / max : 0;
      return `<td title="${esc(name)}, ${MONTHS[c]}: ${v} sold" style="background:${v ? `rgba(74,46,36,${a.toFixed(2)})` : "rgba(231,216,201,.45)"};color:${a > .5 ? "var(--ivory)" : "var(--choc)"}">${v || ""}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>`;
}

/* ---------- deals and payments ---------- */
function renderDeals(S) {
  const rows = new Map(), withNone = S.sales.filter(x => !x.s.deal && !x.s.totals.custom);
  S.sales.forEach(x => {
    if (x.s.deal) { const r = rows.get(x.s.deal.id) || { name: x.s.deal.name, uses: 0, takings: 0, off: 0 }; r.uses++; r.takings += x.net; r.off += x.s.totals.deal; rows.set(x.s.deal.id, r); }
    if (x.s.totals.custom) { const r = rows.get("~custom") || { name: "Custom discounts", uses: 0, takings: 0, off: 0 }; r.uses++; r.takings += x.net; r.off += x.s.totals.custom; rows.set("~custom", r); }
    if (x.s.totals.changed) { const r = rows.get("~changed") || { name: "Price changes", uses: 0, takings: 0, off: 0 }; r.uses++; r.takings += x.net; r.off += x.s.totals.changed; rows.set("~changed", r); }
  });
  const list = [...rows.values()].sort((a, b) => b.uses - a.uses);
  const plain = withNone.length ? money(sum(withNone, x => x.net) / withNone.length) : "–";
  $("#dealTable").innerHTML = list.length ? `<table class="tbl" style="min-width:420px"><thead><tr><th>Deal</th><th class="r">Used</th><th class="r">Average sale</th><th class="r">Given away</th></tr></thead><tbody>
    ${list.map(r => `<tr><td>${esc(r.name)}</td><td class="r num">${r.uses}</td><td class="r num">${money(r.takings / r.uses)}</td><td class="r num">${money(r.off)}</td></tr>`).join("")}
    <tr><td><small>No deal or discount</small></td><td class="r num"><small>${withNone.length}</small></td><td class="r num"><small>${plain}</small></td><td></td></tr></tbody></table>
    <p class="help" style="margin-top:10px">If a deal's average sale is well above the “no deal” average, it's getting people to buy more.</p>` : `<p class="help">No deals or discounts used in this period.</p>`;
}
function renderPays(S) {
  const m = {}; S.sales.forEach(x => { const r = m[x.s.payment] ||= { name: PAY_LABEL[x.s.payment], v: 0, n: 0 }; r.v += x.net; r.n++; });
  const rows = Object.values(m).sort((a, b) => b.v - a.v), total = sum(rows, r => r.v);
  $("#payHint").textContent = total ? `${money(total)} in this period.` : "";
  bars($("#pays"), rows, r => `${money(r.v)} <small>· ${plural(r.n, "sale")} · ${pct(r.v, total)}%</small>`);
}
function renderLow() {
  const out = [];
  D.products.forEach(p => {
    const rec = D.stock[p.id]; if (!rec?.levels) return;
    Pricing.stockKeys(p).forEach(({ key, label }) => { const n = rec.levels[key]; if (typeof n === "number" && n <= (rec.low ?? 3)) out.push({ name: label ? `${p.name}, ${label}` : p.name, v: Math.max(n, 0), n }); });
  });
  out.sort((a, b) => a.n - b.n);
  $("#lowStock").innerHTML = out.length ? out.slice(0, 12).map(r => `<li><span>${esc(r.name)}</span><span class="num ${r.n <= 0 ? "bad" : ""}">${r.n <= 0 ? "None left" : `${r.n} left`}</span></li>`).join("")
    : `<li class="help">Nothing is running low${Object.keys(D.stock).length ? "" : ". Add your stock counts on the Stock page to see warnings here"}.</li>`;
}

/* ---------- managing events ---------- */
const evSheet = $("#evSheet");
$("#eventsBtn").addEventListener("click", () => { evList(); evSheet.showModal(); });
function evList() {
  $("#esTitle").textContent = "Events";
  const used = new Set(D.sales.filter(s => !s.voided).map(s => s.eventId));
  const list = D.events.slice().sort((a, b) => b.date.localeCompare(a.date));
  $("#esBody").innerHTML = list.length ? `<ul class="mlist">${list.map(e => `<li><div><b>${esc(e.name)}</b><span>${esc(niceDay(e.date))}${e.location ? ` · ${esc(e.location)}` : ""}${e.pitchFee ? ` · Pitch ${money(e.pitchFee)}` : ""}${used.has(e.id) ? "" : " · No sales yet"}</span></div><button class="btn btn--ghost btn--sm" type="button" data-edit="${esc(e.id)}">Edit</button></li>`).join("")}</ul>` : `<p class="help">No events yet.</p>`;
  $("#esFoot").innerHTML = `<span class="spacer"></span><button class="btn" type="button" id="evAdd">Add an event</button>`;
}
function evForm(e) {
  $("#esTitle").textContent = e ? "Edit event" : "Add an event";
  const hasSales = e && D.sales.some(s => s.eventId === e.id && !s.voided);
  $("#esBody").innerHTML = `<form id="evForm" novalidate><div class="form-err" id="evErr" role="alert" hidden></div>
    <div class="field"><label for="e-name">Name <span class="req">(required)</span></label><input class="input" id="e-name" name="name" maxlength="80" value="${esc(e?.name)}" required><p class="err" data-err="name" hidden></p></div>
    <div class="field"><label for="e-loc">Location</label><input class="input" id="e-loc" name="location" maxlength="80" value="${esc(e?.location)}" placeholder="Town or venue"></div>
    <div class="field"><label for="e-date">Date</label><input class="input" id="e-date" name="date" type="date" value="${esc(e?.date || iso(new Date()))}" required><p class="err" data-err="date" hidden></p></div>
    <div class="row2">
      <div class="field"><label for="e-fee">Pitch fee</label><span class="money-in"><input class="input" id="e-fee" name="pitchFee" inputmode="decimal" value="${e?.pitchFee || ""}" placeholder="0"></span><p class="err" data-err="pitchFee" hidden></p></div>
      <div class="field"><label for="e-oth">Other costs</label><span class="money-in"><input class="input" id="e-oth" name="otherCosts" inputmode="decimal" value="${e?.otherCosts || ""}" placeholder="0"></span><p class="help">Fuel, parking, a helper.</p><p class="err" data-err="otherCosts" hidden></p></div>
    </div>
    <div class="field"><label for="e-notes">Notes</label><textarea class="input" id="e-notes" name="notes" maxlength="500" placeholder="Weather, footfall, what to bring next time">${esc(e?.notes)}</textarea></div>
    ${e?.cashUp ? `<p class="help">Cashed up by ${esc(e.cashUp.by)}: float ${money(e.cashUp.float)}, counted ${money(e.cashUp.counted)}.</p>` : ""}</form>`;
  $("#esFoot").innerHTML = `${e && !hasSales ? `<button class="btn btn--danger" type="button" id="evDel">Delete</button>` : ""}<span class="spacer"></span><button class="btn btn--ghost" type="button" id="evBack">Back</button><button class="btn" type="button" id="evSave">Save</button>`;
  evSheet.dataset.id = e?.id || ""; $("#e-name").focus();
}
$("#esBody").addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) evForm(D.events.find(x => x.id === b.dataset.edit)); });
$("#esBody").addEventListener("submit", e => { e.preventDefault(); $("#evSave").click(); });
$("#esFoot").addEventListener("click", async e => {
  const id = evSheet.dataset.id;
  if (e.target.id === "evAdd") evForm(null);
  if (e.target.id === "evBack") evList();
  if (e.target.id === "evSave") {
    const f = $("#evForm"), btn = e.target; $$("[data-err]", f).forEach(x => { x.hidden = true; }); $("#evErr").hidden = true;
    btn.disabled = true;
    try {
      const body = { name: f.name.value, location: f.location.value, date: f.date.value, pitchFee: f.pitchFee.value || 0, otherCosts: f.otherCosts.value || 0, notes: f.notes.value };
      const saved = await api(id ? `/events/${id}` : "/events", { method: id ? "PUT" : "POST", body });
      if (id) { D.events[D.events.findIndex(x => x.id === id)] = saved; D.sales.forEach(s => { if (s.eventId === id) s.date = saved.date; }); } else D.events.push(saved);
      toast(id ? "Event saved" : "Event added"); fillFilters(); render(); evList();
    } catch (ex) { if (!ex.quiet) formError(f, "#evErr", ex); }
    finally { btn.disabled = false; }
  }
  if (e.target.id === "evDel" && await confirmBox("Delete this event?", "It has no sales, so nothing else changes.", "Delete")) {
    try { await api(`/events/${id}`, { method: "DELETE" }); D.events = D.events.filter(x => x.id !== id); toast("Event deleted"); fillFilters(); render(); evList(); }
    catch (ex) { if (!ex.quiet) toast(ex.message, true); }
  }
});
function formError(f, box, ex) {
  const el = ex.field && $(`[data-err="${ex.field}"]`, f);
  if (el) { el.textContent = ex.message; el.hidden = false; f.elements[ex.field]?.focus?.(); }
  else { $(box).textContent = ex.message; $(box).hidden = false; }
}

/* ---------- managing deals ---------- */
const dlSheet = $("#dlSheet");
$("#dealsBtn").addEventListener("click", () => { dlList(); dlSheet.showModal(); });
function dlList() {
  $("#dsTitle").textContent = "Deals";
  $("#dsBody").innerHTML = `<p class="help" style="margin-bottom:16px">Bundles switch on by themselves on the Sell page when someone's basket qualifies. Money-off and percentage deals are picked by hand.</p>` +
    (D.deals.length ? `<ul class="mlist">${D.deals.map(d => `<li class="${d.active ? "" : "off"}"><div><b>${esc(d.name)}</b><span>${esc(Pricing.describe(d))}${d.active ? "" : " · Switched off"}</span></div><span style="display:flex;gap:6px"><button class="btn btn--ghost btn--sm" type="button" data-toggle="${esc(d.id)}">${d.active ? "Switch off" : "Switch on"}</button><button class="btn btn--ghost btn--sm" type="button" data-edit="${esc(d.id)}">Edit</button></span></li>`).join("")}</ul>` : `<p class="help">No deals yet. Add one, for example “3 wax melts for £20”.</p>`);
  $("#dsFoot").innerHTML = `<span class="spacer"></span><button class="btn" type="button" id="dlAdd">Add a deal</button>`;
}
function dlForm(d) {
  $("#dsTitle").textContent = d ? "Edit deal" : "Add a deal";
  const kind = d?.kind || "bundle", picked = new Set(d?.productIds || []);
  $("#dsBody").innerHTML = `<form id="dlForm" novalidate><div class="form-err" id="dlErr" role="alert" hidden></div>
    <div class="field"><label for="d-name">Name <span class="req">(required)</span></label><input class="input" id="d-name" name="name" maxlength="60" value="${esc(d?.name)}" placeholder="3 wax melts for £20" required><p class="err" data-err="name" hidden></p></div>
    <div class="field"><label for="d-kind">Kind of deal</label><select class="input" id="d-kind" name="kind">
      <option value="bundle"${kind === "bundle" ? " selected" : ""}>Bundle: any few for a set price</option>
      <option value="percent"${kind === "percent" ? " selected" : ""}>Percentage off the sale</option>
      <option value="amount"${kind === "amount" ? " selected" : ""}>Money off the sale</option></select></div>
    <div data-k="bundle"><div class="row2">
      <div class="field"><label for="d-qty">How many</label><input class="input" id="d-qty" name="qty" inputmode="numeric" value="${d?.qty || 3}"><p class="err" data-err="qty" hidden></p></div>
      <div class="field"><label for="d-price">For</label><span class="money-in"><input class="input" id="d-price" name="price" inputmode="decimal" value="${d?.price ?? ""}" placeholder="20"></span><p class="err" data-err="price" hidden></p></div></div>
      <div class="field"><span class="lbl">Which products count</span><div class="plist2">${D.products.map(p => `<label><input type="checkbox" name="pid" value="${esc(p.id)}"${picked.has(p.id) ? " checked" : ""}>${esc(p.name)} <span class="help">${gbp(p.price)}</span></label>`).join("")}</div><p class="err" data-err="productIds" hidden></p></div></div>
    <div data-k="percent"><div class="field"><label for="d-pct">Percent off</label><input class="input" id="d-pct" name="percent" inputmode="numeric" value="${d?.percent || ""}" placeholder="10"><p class="err" data-err="percent" hidden></p></div></div>
    <div data-k="amount"><div class="field"><label for="d-amt">Amount off</label><span class="money-in"><input class="input" id="d-amt" name="amount" inputmode="decimal" value="${d?.amount || ""}" placeholder="5"></span><p class="err" data-err="amount" hidden></p></div></div>
    <label class="check"><input type="checkbox" name="active"${d?.active === false ? "" : " checked"}><div><b>Running now</b><span>Untick to keep the deal but stop offering it.</span></div></label></form>`;
  $("#dsFoot").innerHTML = `${d ? `<button class="btn btn--danger" type="button" id="dlDel">Delete</button>` : ""}<span class="spacer"></span><button class="btn btn--ghost" type="button" id="dlBack">Back</button><button class="btn" type="button" id="dlSave">Save</button>`;
  dlSheet.dataset.id = d?.id || ""; showKind(); $("#d-name").focus();
}
function showKind() { const k = $("#d-kind").value; $$("#dlForm [data-k]").forEach(el => { el.hidden = el.dataset.k !== k; }); }
$("#dsBody").addEventListener("change", e => { if (e.target.id === "d-kind") showKind(); });
$("#dsBody").addEventListener("submit", e => { e.preventDefault(); $("#dlSave").click(); });
$("#dsBody").addEventListener("click", async e => {
  const ed = e.target.closest("[data-edit]"); if (ed) return dlForm(D.deals.find(x => x.id === ed.dataset.edit));
  const tg = e.target.closest("[data-toggle]"); if (!tg) return;
  const d = D.deals.find(x => x.id === tg.dataset.toggle);
  try { Object.assign(d, await api(`/deals/${d.id}`, { method: "PUT", body: { ...d, active: !d.active } })); toast(d.active ? `${d.name} is on` : `${d.name} is switched off`); dlList(); }
  catch (ex) { if (!ex.quiet) toast(ex.message, true); }
});
$("#dsFoot").addEventListener("click", async e => {
  const id = dlSheet.dataset.id;
  if (e.target.id === "dlAdd") dlForm(null);
  if (e.target.id === "dlBack") dlList();
  if (e.target.id === "dlSave") {
    const f = $("#dlForm"), btn = e.target; $$("[data-err]", f).forEach(x => { x.hidden = true; }); $("#dlErr").hidden = true;
    const body = { name: f.name.value, kind: f.kind.value, qty: f.qty.value, price: f.price.value, percent: f.percent.value, amount: f.amount.value, active: f.active.checked, productIds: $$("input[name=pid]:checked", f).map(x => x.value) };
    btn.disabled = true;
    try {
      const saved = await api(id ? `/deals/${id}` : "/deals", { method: id ? "PUT" : "POST", body });
      if (id) D.deals[D.deals.findIndex(x => x.id === id)] = saved; else D.deals.push(saved);
      toast(id ? "Deal saved" : "Deal added"); dlList();
    } catch (ex) { if (!ex.quiet) formError(f, "#dlErr", ex); }
    finally { btn.disabled = false; }
  }
  if (e.target.id === "dlDel" && await confirmBox("Delete this deal?", "Deals that have been used are kept for your reports; switch those off instead.", "Delete")) {
    try { await api(`/deals/${id}`, { method: "DELETE" }); D.deals = D.deals.filter(x => x.id !== id); toast("Deal deleted"); dlList(); }
    catch (ex) { if (!ex.quiet) toast(ex.message, true); }
  }
});
$$("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

boot(load);
