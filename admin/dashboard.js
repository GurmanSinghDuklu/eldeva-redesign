/* Eldeva overview: orders waiting to be sent, and takings for today, the last 7 days and the last 30 days.
   Reads orders from `Orders` (mock-data.js for now). */
"use strict";
const DAY = 864e5;
let orders = [];

async function load(user) {
  const h = new Date().getHours();
  $("#hello").textContent = `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}, ${user}`;
  $("#today").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  try { orders = await Orders.list(); }
  catch (e) { $("#qNote").textContent = `Couldn't load orders. ${e.message}`; return; }
  renderQueue(); renderStats(); renderChart();
}

/* ---------- orders to pack and post ---------- */
function renderQueue() {
  const waiting = orders.filter(o => o.status === "to-send").reverse(), // oldest first, so they go out in order
        withRM = orders.filter(o => o.status === "sent").length;
  $("#qCount").textContent = waiting.length;
  $("#qTitle").textContent = waiting.length === 1 ? "Order to pack and post" : "Orders to pack and post";
  const bits = [];
  if (waiting.length) { const w = when(waiting[0].paidAt); bits.push(`The oldest was paid ${/^[A-Z][a-z]{2} \d/.test(w) ? `on ${w}` : w.replace(/^[A-Z]/, c => c.toLowerCase())}`); }
  if (withRM) bits.push(`${withRM} with Royal Mail, waiting to be marked as posted`);
  $("#qNote").textContent = bits.join(". ") + (bits.length ? "." : "");
  $("#qList").innerHTML = waiting.length ? waiting.slice(0, 6).map(o => `<li><a class="qrow" href="orders.html?order=${o.number}">
      <span><span class="ono">#${o.number}</span><span class="when">${esc(when(o.paidAt))}</span></span>
      <span><span class="cname">${esc(o.customer.name)}</span><span class="isum">${esc(itemSummary(o.items))}</span></span>
      <span class="amt num">${money(o.total)}</span>${chip(o.status)}</a></li>`).join("")
    + (waiting.length > 6 ? `<li><a class="qrow" href="orders.html?status=to-send" style="display:block;text-align:center;font-weight:500">And ${waiting.length - 6} more</a></li>` : "")
    : `<li class="qdone"><b>All caught up</b>Every paid order has gone to Royal Mail.</li>`;
}

/* ---------- sales ---------- */
function takings(fromDay, toDay) { // whole days back from today: 0 = today
  const start = dayStart().getTime();
  const list = orders.filter(o => { const t = Date.parse(o.paidAt); return t >= start - (toDay - 1) * DAY && t < start + DAY - fromDay * DAY; });
  return { total: list.reduce((s, o) => s + o.total, 0), count: list.length };
}
function change(now, before, label) {
  if (!before) return "";
  const pct = Math.round((now - before) / before * 100);
  return pct === 0 ? ` · Same as ${label}` : ` · <b>${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%</b> on ${label}`;
}
function renderStats() {
  const t = takings(0, 1), y = takings(1, 2), w = takings(0, 7), pw = takings(7, 14), m = takings(0, 30), pm = takings(30, 60);
  const n = c => `${c} order${c === 1 ? "" : "s"}`;
  const tile = (label, v, sub) => `<div class="card stat"><p class="lbl">${label}</p><p class="val num">${money(v.total)}</p><p class="sub">${sub}</p></div>`;
  $("#stats").innerHTML =
    tile("Today", t, `${n(t.count)} · Yesterday ${money(y.total)}`) +
    tile("Last 7 days", w, n(w.count) + change(w.total, pw.total, "the 7 days before")) +
    tile("Last 30 days", m, n(m.count) + change(m.total, pm.total, "the 30 days before"));
}

/* ---------- 30 day chart ---------- */
const DAYS = 30;
let series = [], hoverAt = -1;
function renderChart() {
  const start = dayStart().getTime();
  series = Array.from({ length: DAYS }, (_, i) => {
    const day = new Date(start - (DAYS - 1 - i) * DAY), next = day.getTime() + DAY;
    const list = orders.filter(o => { const t = Date.parse(o.paidAt); return t >= day.getTime() && t < next; });
    return { day, total: list.reduce((s, o) => s + o.total, 0), count: list.length };
  });
  const sum = series.reduce((s, d) => s + d.total, 0), best = series.reduce((a, b) => b.total > a.total ? b : a);
  $("#cSum").textContent = `${money(sum)} in total. Best day: ${best.day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}, ${money(best.total)}.`;
  $("#cTable").innerHTML = `<table><thead><tr><th>Day</th><th>Orders</th><th>Takings</th></tr></thead><tbody>${series.slice().reverse().map(d =>
    `<tr><td>${d.day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</td><td class="num">${d.count}</td><td class="num">${money(d.total)}</td></tr>`).join("")}</tbody></table>`;
  draw();
  new ResizeObserver(() => draw()).observe($("#plot"));
  new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { $("#plot").classList.add("in"); io.disconnect(); setTimeout(() => $("#plot").classList.add("done"), 800); } }, { threshold: .3 }).observe($("#plot"));
}

let geo = null;
function draw() {
  const box = $("#plot"), W = box.clientWidth, H = box.clientHeight;
  if (!W || !series.length) return;
  const pad = { l: 46, r: 12, t: 12, b: 28 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(...series.map(d => d.total)), step = max > 300 ? 100 : 50, top = Math.max(step, Math.ceil(max / step) * step);
  const x = i => pad.l + (i / (DAYS - 1)) * iw, y = v => pad.t + ih - (v / top) * ih;
  geo = { x, y, pad, W };
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  const pts = series.map((d, i) => `${x(i).toFixed(1)},${y(d.total).toFixed(1)}`);
  const xl = (iw < 480 ? [0, 14, DAYS - 1] : [0, 7, 14, 21, DAYS - 1]).map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === DAYS - 1 ? "end" : "middle"}">${i === DAYS - 1 ? "Today" : series[i].day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</text>`).join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of daily takings over the last 30 days. ${esc($("#cSum").textContent)} Use the table below for every day's figures.">
    <g class="grid">${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 10}" y="${y(v) + 4}" text-anchor="end">£${v}</text>`).join("")}</g>
    <g class="xaxis">${xl}</g>
    <g class="draw"><path class="area" d="M${pts.join("L")}L${x(DAYS - 1)},${y(0)}L${x(0)},${y(0)}Z"/><path class="line" d="M${pts.join("L")}"/></g>
    <g class="hover"><line class="rule" y1="${pad.t}" y2="${pad.t + ih}"/><circle class="dot" r="5"/></g>
    <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/>
  </svg><div class="tip" aria-hidden="true"></div>`;
  if (hoverAt >= 0) show(hoverAt);
}
function show(i) {
  const box = $("#plot"), d = series[i]; if (!d || !geo) return;
  hoverAt = i;
  const cx = geo.x(i), cy = geo.y(d.total);
  $(".rule", box).setAttribute("x1", cx); $(".rule", box).setAttribute("x2", cx);
  $(".dot", box).setAttribute("cx", cx); $(".dot", box).setAttribute("cy", cy);
  const tip = $(".tip", box);
  tip.innerHTML = `<b>${money(d.total)}</b>${d.day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${d.count} order${d.count === 1 ? "" : "s"}`;
  const half = tip.offsetWidth / 2 + 4, left = Math.min(Math.max(cx, half), geo.W - half);
  tip.style.transform = `translate(${left - tip.offsetWidth / 2}px, ${cy - tip.offsetHeight - 14}px)`;
  box.classList.add("on");
}
function hide() { hoverAt = -1; $("#plot").classList.remove("on"); }

const plot = $("#plot");
plot.tabIndex = 0;
plot.addEventListener("pointermove", e => {
  if (!geo) return;
  const r = plot.getBoundingClientRect(), px = e.clientX - r.left;
  show(Math.round(Math.min(Math.max((px - geo.pad.l) / (geo.W - geo.pad.l - geo.pad.r), 0), 1) * (DAYS - 1)));
});
plot.addEventListener("pointerleave", hide);
plot.addEventListener("blur", hide);
plot.addEventListener("keydown", e => {
  const k = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (k) { e.preventDefault(); show(Math.min(Math.max((hoverAt < 0 ? DAYS : hoverAt) + k, 0), DAYS - 1)); }
  else if (e.key === "Home" || e.key === "End") { e.preventDefault(); show(e.key === "Home" ? 0 : DAYS - 1); }
});

boot(load);
