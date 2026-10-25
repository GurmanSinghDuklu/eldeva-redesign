// In-person sales for markets and events: events, deals, stock and cost per item, and the sales themselves.
// Everything is kept in data/ (events.json, deals.json, stock.json, sales.json), never in catalog.js,
// so costs and stock levels stay private. Totals are worked out with admin/pricing.js, the same code the Sell page uses.
"use strict";
const path = require("path"), fsp = require("fs").promises, crypto = require("crypto");
const Pricing = require("../admin/pricing.js");

const PAYMENTS = ["cash", "card", "other"];
const DEAL_KINDS = ["bundle", "percent", "amount"];

module.exports = function salesApi({ DATA, readProducts, readBody, send, Invalid, text, queued, writeAtomic }) {
  const file = name => path.join(DATA, name + ".json");
  async function read(name) {
    try { return JSON.parse(await fsp.readFile(file(name), "utf8")); }
    catch (e) { if (e.code === "ENOENT") return name === "stock" ? {} : []; throw e; }
  }
  const write = (name, v) => writeAtomic(file(name), JSON.stringify(v, null, 1) + "\n");
  const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");

  /* ---------- checking what comes in ---------- */
  function money(v, field, { max = 100000, blank = false } = {}) {
    if (blank && (v === "" || v === null || v === undefined)) return null;
    const n = typeof v === "string" ? Number(v.replace(/[£,\s]/g, "")) : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) throw new Invalid(field, "Enter an amount like 12 or 4.50.");
    return Pricing.r2(n);
  }
  function whole(v, field, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new Invalid(field, `Enter a whole number from ${min} to ${max}.`);
    return n;
  }
  function day(v, field) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "") || isNaN(Date.parse(v))) throw new Invalid(field, "Pick a date.");
    return v;
  }
  const findOr404 = (list, id, what) => { const i = list.findIndex(x => x.id === id); if (i < 0) throw Object.assign(new Invalid("", `That ${what} doesn't exist any more.`), { status: 404 }); return i; };

  function cleanEvent(b) {
    return {
      name: text(b.name, "name", 80, true), location: text(b.location, "location", 80),
      date: day(b.date, "date"),
      pitchFee: money(b.pitchFee ?? 0, "pitchFee"), otherCosts: money(b.otherCosts ?? 0, "otherCosts"),
      notes: text(b.notes, "notes", 500)
    };
  }
  function cleanDeal(b, products) {
    const kind = DEAL_KINDS.includes(b.kind) ? b.kind : (() => { throw new Invalid("kind", "Pick a kind of deal."); })();
    const d = { name: text(b.name, "name", 60, true), kind, active: b.active !== false };
    if (kind === "bundle") {
      d.qty = whole(b.qty, "qty", 2, 20);
      d.price = money(b.price, "price", { max: 10000 });
      d.productIds = (Array.isArray(b.productIds) ? b.productIds : []).filter(id => products.some(p => p.id === id));
      if (!d.productIds.length) throw new Invalid("productIds", "Tick at least one product the bundle applies to.");
    } else if (kind === "percent") {
      d.percent = whole(b.percent, "percent", 1, 90);
    } else d.amount = money(b.amount, "amount", { max: 1000 });
    return d;
  }

  /* ---------- a sale ---------- */
  async function buildSale(b, user) {
    const [products, events, deals, stock] = await Promise.all([readProducts(), read("events"), read("deals"), read("stock")]);
    const ev = events.find(e => e.id === b.eventId);
    if (!ev) throw new Invalid("eventId", "Pick the event you're selling at.");
    const rawLines = Array.isArray(b.lines) ? b.lines : [];
    if (!rawLines.length) throw new Invalid("lines", "Add something to the sale first.");
    if (rawLines.length > 60) throw new Invalid("lines", "That's too many lines for one sale.");
    const lines = rawLines.map(l => {
      const p = products.find(x => x.id === l.productId);
      if (!p) throw new Invalid("lines", "One of these products has been removed. Take it out of the sale.");
      const variant = typeof l.variant === "string" ? l.variant : "";
      if (p.variants.length ? !p.variants.includes(variant) : variant) throw new Invalid("lines", `Pick a fragrance for ${p.name}.`);
      const sizes = p.sizes || [], size = sizes.length ? sizes.find(s => s.id === l.size) : null;
      if (sizes.length && !size) throw new Invalid("lines", `Pick a size for ${p.name}.`);
      const list = size ? size.price : p.price;
      const price = l.price === undefined ? list : money(l.price, "lines", { max: 10000 });
      return {
        productId: p.id, name: p.name, type: p.type, size: size ? size.id : "", sizeName: size ? size.name : "", variant, qty: whole(l.qty, "lines", 1, 99),
        listPrice: list, price, reason: price !== list ? text(l.reason, "lines", 60) || "Price changed" : "",
        cost: Pricing.costFor(stock[p.id], size && size.id)
      };
    });
    let deal = null;
    if (b.dealId) {
      deal = deals.find(d => d.id === b.dealId && d.active);
      if (!deal) throw new Invalid("dealId", "That deal isn't running any more. Pick another.");
    }
    const custom = b.custom && b.custom.amount ? { amount: money(b.custom.amount, "custom", { max: 10000 }), reason: text(b.custom.reason, "custom", 60) || "Discount" } : null;
    const totals = Pricing.price(lines, deal, custom?.amount);
    if (deal && !totals.deal) deal = null; // picked a deal that doesn't apply to this basket
    const payment = PAYMENTS.includes(b.payment) ? b.payment : (() => { throw new Invalid("payment", "Choose how they paid."); })();
    return {
      sale: {
        id: newId(), clientId: text(b.clientId, "clientId", 40), eventId: ev.id, date: ev.date, at: new Date().toISOString(), by: user,
        lines, deal: deal ? { id: deal.id, name: deal.name } : null,
        custom: custom ? { ...custom, amount: totals.custom } : null, totals, payment,
        cashGiven: payment === "cash" && b.cashGiven ? money(b.cashGiven, "cashGiven", { max: 10000 }) : null,
        note: text(b.note, "note", 200), voided: false
      }
    };
  }
  // stock goes down for every item sold (or back up when a sale is undone); a product nobody has counted yet is left alone
  function moveStock(stock, lines, sign) {
    for (const l of lines) {
      const rec = stock[l.productId], key = Pricing.stockKey(l.size, l.variant);
      if (rec && rec.levels && typeof rec.levels[key] === "number") rec.levels[key] -= sign * l.qty;
    }
  }

  /* ---------- routes ---------- */
  return async function handle(route, method, req, res, user) {
    let m;
    // everything the Sell page needs in one go
    if (route === "/sell/setup" && method === "GET") {
      const [products, events, deals, stock] = await Promise.all([readProducts(), read("events"), read("deals"), read("stock")]);
      return send(res, 200, {
        user, stock, deals: deals.filter(d => d.active),
        products: products.map(p => ({ id: p.id, name: p.name, type: p.type, price: p.price, img: p.img, variants: p.variants, sizes: p.sizes || [], visible: p.visible })),
        events: events.slice().sort((a, b) => b.date.localeCompare(a.date))
      });
    }
    // everything the Events dashboard needs (it does the adding up itself, so filters are instant)
    if (route === "/sales/all" && method === "GET") {
      const [products, events, deals, stock, sales] = await Promise.all([readProducts(), read("events"), read("deals"), read("stock"), read("sales")]);
      return send(res, 200, { products: products.map(p => ({ id: p.id, name: p.name, type: p.type, price: p.price, img: p.img, variants: p.variants, sizes: p.sizes || [] })), events, deals, stock, sales });
    }
    if (route === "/sales" && method === "GET") { // one event's sales, for the Sell page
      const ev = new URL(req.url, "http://x").searchParams.get("event") || "";
      return send(res, 200, (await read("sales")).filter(x => x.eventId === ev));
    }
    if (route === "/sales" && method === "POST") {
      const body = await readBody(req, 64 * 1024);
      return send(res, 200, await queued(async () => {
        const sales = await read("sales");
        if (body.clientId) { const dup = sales.find(s => s.clientId === body.clientId); if (dup) return dup; } // the same sale sent twice after a dropped signal
        const { sale } = await buildSale(body, user), stock = await read("stock");
        moveStock(stock, sale.lines, 1); sales.push(sale);
        await write("stock", stock); await write("sales", sales);
        return sale;
      }));
    }
    if ((m = /^\/sales\/([a-z0-9]+)\/(void|restore)$/.exec(route)) && method === "POST") {
      return send(res, 200, await queued(async () => {
        const sales = await read("sales"), s = sales[findOr404(sales, m[1], "sale")], undo = m[2] === "void";
        if (s.voided === undo) return s;
        const stock = await read("stock");
        moveStock(stock, s.lines, undo ? -1 : 1);
        Object.assign(s, { voided: undo, voidedBy: undo ? user : "", voidedAt: undo ? new Date().toISOString() : "" });
        await write("stock", stock); await write("sales", sales);
        return s;
      }));
    }

    if (route === "/events" && method === "POST") {
      const e = { id: newId(), ...cleanEvent(await readBody(req, 16 * 1024)), cashUp: null };
      return send(res, 200, await queued(async () => { const list = await read("events"); list.push(e); await write("events", list); return e; }));
    }
    if ((m = /^\/events\/([a-z0-9]+)$/.exec(route)) && (method === "PUT" || method === "DELETE")) {
      const body = method === "PUT" ? cleanEvent(await readBody(req, 16 * 1024)) : null;
      return send(res, 200, await queued(async () => {
        const list = await read("events"), i = findOr404(list, m[1], "event");
        if (body) {
          const changedDay = body.date !== list[i].date;
          list[i] = { ...list[i], ...body };
          if (changedDay) { const sales = await read("sales"); sales.forEach(s => { if (s.eventId === m[1]) s.date = body.date; }); await write("sales", sales); }
          await write("events", list); return list[i];
        }
        if ((await read("sales")).some(s => s.eventId === m[1] && !s.voided)) throw new Invalid("", "This event has sales, so it can't be deleted. Undo its sales first.");
        list.splice(i, 1); await write("events", list); return { ok: true };
      }));
    }
    if ((m = /^\/events\/([a-z0-9]+)\/cashup$/.exec(route)) && method === "PUT") {
      const b = await readBody(req, 4096);
      const cashUp = { float: money(b.float ?? 0, "float"), counted: money(b.counted, "counted"), at: new Date().toISOString(), by: user };
      return send(res, 200, await queued(async () => {
        const list = await read("events"), i = findOr404(list, m[1], "event");
        list[i].cashUp = cashUp; await write("events", list); return list[i];
      }));
    }

    if (route === "/deals" && method === "POST") {
      const d = { id: newId(), ...cleanDeal(await readBody(req, 16 * 1024), await readProducts()) };
      return send(res, 200, await queued(async () => { const list = await read("deals"); list.push(d); await write("deals", list); return d; }));
    }
    if ((m = /^\/deals\/([a-z0-9]+)$/.exec(route)) && (method === "PUT" || method === "DELETE")) {
      const body = method === "PUT" ? cleanDeal(await readBody(req, 16 * 1024), await readProducts()) : null;
      return send(res, 200, await queued(async () => {
        const list = await read("deals"), i = findOr404(list, m[1], "deal");
        if (body) { list[i] = { id: list[i].id, ...body }; await write("deals", list); return list[i]; }
        if ((await read("sales")).some(s => s.deal && s.deal.id === m[1])) throw new Invalid("", "This deal has been used, so it's kept for your reports. Switch it off instead.");
        list.splice(i, 1); await write("deals", list); return { ok: true };
      }));
    }

    if (route === "/stock" && method === "GET") {
      const [products, stock] = await Promise.all([readProducts(), read("stock")]);
      return send(res, 200, { products: products.map(p => ({ id: p.id, name: p.name, type: p.type, price: p.price, img: p.img, variants: p.variants, sizes: p.sizes || [], visible: p.visible })), stock });
    }
    if ((m = /^\/stock\/([a-z0-9-]+)$/.exec(route)) && method === "PUT") {
      const b = await readBody(req, 16 * 1024), p = (await readProducts()).find(x => x.id === m[1]);
      if (!p) return send(res, 404, { error: "That product doesn't exist any more." });
      const levels = {}, costs = {};
      for (const { key } of Pricing.stockKeys(p)) {
        const v = b.levels?.[key];
        if (v !== "" && v !== null && v !== undefined) levels[key] = whole(v, "levels", -999, 99999);
      }
      for (const s of p.sizes || []) { const c = money(b.costs?.[s.id], "costs", { max: 10000, blank: true }); if (c !== null) costs[s.id] = c; }
      const rec = { cost: money(b.cost, "cost", { max: 10000, blank: true }), costs, low: whole(b.low ?? 3, "low", 0, 999), levels };
      return send(res, 200, await queued(async () => { const stock = await read("stock"); stock[p.id] = rec; await write("stock", stock); return rec; }));
    }
    return false;
  };
};
