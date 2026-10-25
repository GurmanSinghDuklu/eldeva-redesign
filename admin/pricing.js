/* Works out the totals for an in-person sale, and how stock is keyed by size and fragrance. Used by the Sell page and by server.js (lib/sales.js),
   so the figure on screen is always the figure that gets saved.
   A line is { productId, qty, listPrice, price } where price is what was charged per item.
   A deal is one of:
     { kind: "bundle", qty: 3, price: 20, productIds: [...] }  any 3 of these for £20
     { kind: "percent", percent: 10 }                          10% off the sale
     { kind: "amount", amount: 5 }                             £5 off the sale */
(function (root) {
  "use strict";
  const r2 = v => Math.round(v * 100) / 100;
  const gbp = v => "£" + (Number.isInteger(v) ? v : v.toFixed(2));

  // Lines with a changed price are left out of bundles, so a discount isn't given twice.
  function dealDiscount(deal, lines, subtotal) {
    if (!deal) return 0;
    if (deal.kind === "percent") return r2(subtotal * deal.percent / 100);
    if (deal.kind === "amount") return Math.min(deal.amount, subtotal);
    if (deal.kind === "bundle") {
      const units = [];
      for (const l of lines) if (deal.productIds.includes(l.productId) && l.price === l.listPrice) for (let i = 0; i < l.qty; i++) units.push(l.price);
      const sets = Math.floor(units.length / deal.qty);
      if (!sets) return 0;
      units.sort((a, b) => b - a);
      const full = units.slice(0, sets * deal.qty).reduce((s, v) => s + v, 0);
      return Math.max(0, r2(full - sets * deal.price));
    }
    return 0;
  }

  function price(lines, deal, customDiscount) {
    const subtotal = r2(lines.reduce((s, l) => s + l.qty * l.price, 0));
    const listTotal = r2(lines.reduce((s, l) => s + l.qty * l.listPrice, 0));
    const dealOff = dealDiscount(deal, lines, subtotal);
    const customOff = Math.max(0, Math.min(r2(customDiscount || 0), r2(subtotal - dealOff)));
    return {
      units: lines.reduce((s, l) => s + l.qty, 0),
      listTotal, subtotal, changed: r2(listTotal - subtotal),
      deal: dealOff, custom: customOff, total: r2(subtotal - dealOff - customOff)
    };
  }

  // Bundles switch themselves on when the basket qualifies; percent and amount deals are picked by hand.
  function bestBundle(deals, lines) {
    let best = null, most = 0;
    for (const d of deals) if (d.active && d.kind === "bundle") { const off = dealDiscount(d, lines, 0); if (off > most) { most = off; best = d; } }
    return best;
  }

  function describe(d) {
    if (d.kind === "bundle") return `Any ${d.qty} for ${gbp(d.price)}`;
    if (d.kind === "percent") return `${d.percent}% off`;
    return `${gbp(d.amount)} off`;
  }

  // Stock is counted per size and fragrance. A product with neither has one count, keyed "".
  const stockKey = (size, variant) => size ? `${size}|${variant}` : variant;
  function stockKeys(p) {
    const sizes = p.sizes && p.sizes.length ? p.sizes : [null], scents = p.variants.length ? p.variants : [""], out = [];
    for (const s of sizes) for (const v of scents) out.push({ key: stockKey(s && s.id, v), size: s, variant: v, label: [s && s.name, v].filter(Boolean).join(" · ") });
    return out;
  }
  // a size can have its own cost; otherwise the product's cost is used
  const costFor = (rec, sizeId) => (sizeId && rec && rec.costs && typeof rec.costs[sizeId] === "number") ? rec.costs[sizeId] : rec && typeof rec.cost === "number" ? rec.cost : null;

  const api = { price, dealDiscount, bestBundle, describe, r2, stockKey, stockKeys, costFor };
  if (typeof module === "object" && module.exports) module.exports = api; else root.Pricing = api;
})(typeof window !== "undefined" ? window : globalThis);
