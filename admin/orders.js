/* Eldeva orders: find an order, see what to pack, send it to Royal Mail Click & Drop, mark it posted,
   print a packing slip and keep private notes. Reads and changes orders through `Orders` (mock-data.js for now). */
"use strict";
const PAGE = 30, DAY = 864e5;
let orders = [], status = "", shown = PAGE, open = null;
const params = new URLSearchParams(location.search);

async function load() {
  try { orders = await Orders.list(); }
  catch (e) { if (!e.quiet) { $("#list").innerHTML = `<li class="empty"><h2>Couldn't load the orders</h2><p>${esc(e.message)}</p></li>`; $("#sum").textContent = ""; } return; }
  const want = params.get("status");
  status = want !== null && (want === "" || STATUS[want]) ? want : orders.some(o => o.status === "to-send") ? "to-send" : "";
  render();
  if (params.get("order")) openOrder(Number(params.get("order")));
}

/* ---------- list ---------- */
const matches = (o, q) => !q || String(o.number) === q.replace(/^#/, "") ||
  [o.customer.name, o.customer.email, o.address.postcode, o.address.town].some(v => v.toLowerCase().includes(q));
function render() {
  const q = $("#q").value.trim().toLowerCase(), days = Number($("#range").value);
  const since = q || !days ? 0 : dayStart().getTime() - (days - 1) * DAY; // a search looks through every order
  const inRange = orders.filter(o => Date.parse(o.paidAt) >= since && matches(o, q));
  const list = inRange.filter(o => !status || o.status === status);

  $$("#seg button").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.status === status));
    $(".n", b).textContent = inRange.filter(o => !b.dataset.status || o.status === b.dataset.status).length;
  });
  const waiting = orders.filter(o => o.status === "to-send").length;
  $("#sum").textContent = `${waiting ? `${waiting} order${waiting === 1 ? "" : "s"} to pack and post` : "Everything has been sent"}${q ? ". Searching every order" : ""}`;

  if (!list.length) {
    $("#list").innerHTML = `<li class="empty"><h2>${q ? "Nothing matches" : status === "to-send" ? "All caught up" : "No orders here"}</h2><p>${q ? "Try a name, email, postcode or order number like 1204." : status === "to-send" ? "Every paid order has gone to Royal Mail." : "Try a longer date range."}</p></li>`;
    $("#more").hidden = true; return;
  }
  const rows = status === "to-send" ? list.slice().reverse() : list; // pack the oldest first
  $("#list").innerHTML = rows.slice(0, shown).map(o => `<li class="orow" data-n="${o.number}">
    <span><span class="ono">#${o.number}</span><span class="when">${esc(when(o.paidAt))}</span></span>
    <span class="thumbs" aria-hidden="true">${o.items.slice(0, 3).map(l => `<img src="${esc(src(l.img))}" alt="" loading="lazy">`).join("")}</span>
    <span><button class="cname" type="button" data-open>${esc(o.customer.name)}</button><span class="isum">${esc(itemSummary(o.items))}</span></span>
    <span class="amt num">${money(o.total)}</span>${chip(o.status)}</li>`).join("");
  $("#more").hidden = rows.length <= shown;
}
$("#q").addEventListener("input", () => { shown = PAGE; render(); });
$("#range").addEventListener("change", () => { shown = PAGE; render(); });
$("#seg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  status = b.dataset.status; shown = PAGE; render();
  const u = new URL(location); u.searchParams.set("status", status); u.searchParams.delete("order"); history.replaceState(null, "", u);
});
$("#more button").addEventListener("click", () => { shown += PAGE; render(); });
$("#list").addEventListener("click", e => { const row = e.target.closest(".orow"); if (row) openOrder(Number(row.dataset.n)); });

/* ---------- one order ---------- */
const byNumber = n => orders.find(o => o.number === n);
function openOrder(n) {
  const o = byNumber(n);
  if (!o) return toast(`There's no order #${n}.`, true);
  open = o; fillSheet();
  if (!$("#sheet").open) $("#sheet").showModal();
  $("#oBody").scrollTop = 0;
  const u = new URL(location); u.searchParams.set("order", n); history.replaceState(null, "", u);
}
function fillSheet() {
  const o = open, a = o.address, past = orders.filter(x => x.customer.email === o.customer.email && x !== o);
  const spent = past.reduce((s, x) => s + x.total, o.total);
  $("#oTitle").textContent = `Order #${o.number}`;
  $("#oPaid").textContent = `Paid ${fullDate(o.paidAt)} by card`;
  $("#oChip").innerHTML = chip(o.status);
  const step = (done, title, at) => `<li class="${done ? "done" : ""}"><i></i><div><b>${title}</b>${at ? `<span>${esc(fullDate(at))}</span>` : ""}</div></li>`;

  $("#oBody").innerHTML = `
    <h3>What to pack</h3>
    <ul class="lines">${o.items.map(l => `<li><img src="${esc(src(l.img))}" alt=""><div><b>${esc(l.name)}</b><span>${l.variant ? `Scent: ${esc(l.variant)} · ` : ""}Qty ${l.qty}</span></div><span class="num">${money(l.price * l.qty)}</span></li>`).join("")}</ul>
    <dl class="totals num">
      <dt>Items</dt><dd>${money(o.subtotal)}</dd>
      <dt>Delivery, ${esc(o.service)}</dt><dd>${o.postage ? money(o.postage) : "Free"}</dd>
      <dt class="grand">Paid</dt><dd class="grand">${money(o.total)}</dd>
    </dl>
    ${o.giftNote ? `<div class="gift"><span class="lbl">Gift note to include</span><p>“${esc(o.giftNote)}”</p></div>` : ""}

    <h3>Royal Mail</h3>
    <ol class="steps">
      ${step(true, "Paid", o.paidAt)}
      ${step(o.status !== "to-send", "Sent to Click & Drop", o.sentAt)}
      ${step(o.status === "posted", "Posted", o.postedAt)}
    </ol>
    ${o.tracking ? `<div class="track"><span class="lbl">Tracking</span><code>${esc(o.tracking)}</code><button class="btn btn--ghost btn--sm" type="button" id="copyTrack">Copy</button></div>` : ""}

    <h3>Deliver to</h3>
    <address class="addr">${esc(o.customer.name)}<br>${esc(a.line1)}<br>${a.line2 ? `${esc(a.line2)}<br>` : ""}${esc(a.town)}<br>${esc(a.postcode)}</address>
    <p class="help" style="margin-bottom:22px">${esc(o.service)}</p>

    <h3>Customer</h3>
    <div class="kv">
      <a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a>
      <a href="tel:${esc(o.customer.phone.replace(/\s/g, ""))}">${esc(o.customer.phone)}</a>
      <span class="help">${past.length ? `${past.length + 1} orders in the last 90 days, ${money(spent)} in total` : "First order with Eldeva"}</span>
    </div>
    ${past.length ? `<ul class="past">${past.slice(0, 5).map(x => `<li><button type="button" data-past="${x.number}"><span class="ono">#${x.number}</span><span class="d">${esc(when(x.paidAt))} · ${esc(itemSummary(x.items))}</span><span class="num">${money(x.total)}</span></button></li>`).join("")}</ul>` : ""}

    <h3>Private notes</h3>
    <p class="help" style="margin-bottom:12px">Only you can see these. They aren't sent to the customer.</p>
    ${o.notes.length ? `<ul class="notes">${o.notes.map(n => `<li>${esc(n.text)}<small>${esc(fullDate(n.at))}</small></li>`).join("")}</ul>` : ""}
    <form class="note-add" id="noteForm"><textarea class="input" id="noteText" maxlength="500" placeholder="Add a note, for example “Called about a delivery date”" aria-label="New note"></textarea><button class="btn btn--ghost btn--sm" type="submit">Add note</button></form>`;

  const act = $("#actBtn");
  act.hidden = o.status === "posted";
  act.textContent = o.status === "to-send" ? "Send to Click & Drop" : "Mark as posted";
}

$("#oBody").addEventListener("click", async e => {
  const p = e.target.closest("[data-past]"); if (p) return openOrder(Number(p.dataset.past));
  if (e.target.id === "copyTrack") {
    try { await navigator.clipboard.writeText(open.tracking); toast("Tracking number copied"); }
    catch { toast("Couldn't copy. Select the number and copy it yourself.", true); }
  }
});
$("#oBody").addEventListener("submit", async e => {
  e.preventDefault();
  const text = $("#noteText").value.trim(), btn = e.target.querySelector("button");
  if (!text) return $("#noteText").focus();
  btn.disabled = true;
  try { replace(await Orders.addNote(open.number, text)); toast("Note added"); }
  catch (ex) { toast(ex.message, true); btn.disabled = false; }
});

$("#actBtn").addEventListener("click", async () => {
  const btn = $("#actBtn"), sending = open.status === "to-send", n = open.number;
  btn.disabled = true; btn.textContent = sending ? "Sending…" : "Saving…";
  try {
    replace(sending ? await Orders.sendToClickDrop(n) : await Orders.markPosted(n));
    toast(`${sending ? `#${n} is in Click & Drop with a tracking number` : `#${n} marked as posted`}${Orders.demo ? ". Sample only, nothing was sent" : ""}`);
  } catch (ex) { toast(ex.message, true); fillSheet(); }
  finally { btn.disabled = false; }
});
function replace(o) {
  orders[orders.findIndex(x => x.number === o.number)] = o;
  if (open && open.number === o.number) { open = o; fillSheet(); }
  render();
}

$("[data-close]").addEventListener("click", () => $("#sheet").close());
$("#sheet").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); }); // click on the backdrop
$("#sheet").addEventListener("close", () => {
  open = null; const u = new URL(location); u.searchParams.delete("order"); history.replaceState(null, "", u);
});

/* ---------- packing slip ---------- */
$("#printBtn").addEventListener("click", () => {
  const o = open, a = o.address;
  $("#slip").innerHTML = `
    <div class="slip-top"><span class="wordmark" role="img" aria-label="Eldeva"></span><div style="text-align:right"><h1>Packing slip</h1><p>Order #${o.number} · ${esc(new Date(o.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}</p></div></div>
    <div class="slip-cols">
      <div><span class="lbl">Deliver to</span>${esc(o.customer.name)}<br>${esc(a.line1)}<br>${a.line2 ? `${esc(a.line2)}<br>` : ""}${esc(a.town)}<br>${esc(a.postcode)}</div>
      <div><span class="lbl">Delivery</span>${esc(o.service)}${o.tracking ? `<br>Tracking ${esc(o.tracking)}` : ""}</div>
    </div>
    <table><thead><tr><th>Qty</th><th>Item</th><th>Scent</th></tr></thead>
      <tbody>${o.items.map(l => `<tr><td>${l.qty}</td><td>${esc(l.name)}</td><td>${esc(l.variant || "")}</td></tr>`).join("")}</tbody></table>
    ${o.giftNote ? `<div class="gift"><span class="lbl">A note for you</span><p>“${esc(o.giftNote)}”</p></div>` : ""}
    <p class="bye">Thank you for choosing Eldeva</p>`;
  window.print();
});

boot(load);
