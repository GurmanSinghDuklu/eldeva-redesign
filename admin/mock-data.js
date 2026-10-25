/* Sample orders for the Overview and Orders mock-up. Nothing here is real and nothing is sent anywhere.
   The pages only talk to the `Orders` object below, so once Stripe orders are saved by the server
   each method can become a fetch to /api/orders without touching the pages.
   Orders are generated from a fixed seed, so they stay the same all day; changes you make
   (sending, posting, notes) are kept for this browser tab only. */
"use strict";
const Orders = (() => {
  const PRODUCTS = [ // a copy of the shop's products (data/products.json) with how often each tends to sell
    { id: "sweet-plum", name: "Sweet Plum", price: 30, img: "assets/sweet-plum.jpg", w: 9 },
    { id: "white-sands", name: "White Sands", price: 30, img: "assets/white-sands.jpg", w: 8 },
    { id: "lunas-secret", name: "Luna's Secret", price: 30, img: "assets/lunas-secret.jpg", w: 6 },
    { id: "cozy-embrace", name: "Cozy Embrace", price: 30, img: "assets/cozy-embrace.jpg", w: 9 },
    { id: "velvet-peony", name: "Velvet Peony", price: 30, img: "assets/velvet-peony.jpg", w: 5 },
    { id: "linen-breeze", name: "Linen Breeze", price: 30, img: "assets/linen-breeze.jpg", w: 4 },
    { id: "ivory-petal", name: "Ivory Petal", price: 30, img: "assets/ivory-petal.jpg", w: 3 },
    { id: "rustic-havana", name: "Rustic Havana", price: 30, img: "assets/rustic-havana.jpg", w: 4 },
    { id: "refills", name: "Diffuser Refills with Reeds", price: 24.99, img: "assets/products/diffuser-reed-refills-0.jpg", w: 4, variants: ["Velvet Peony", "Rustic Havana", "Linen Breeze", "Ivory Petal"] },
    { id: "wax-melts", name: "Wax Melts", price: 8, img: "assets/wax-melts.jpg", w: 10, variants: ["Luna's Secret", "Cozy Embrace", "White Sands", "Sweet Plum"] },
    { id: "ritual-set", name: "The Wax Ritual Set", price: 25.99, img: "assets/set-1.jpg", w: 4, variants: ["Sweet Plum", "Maple Haze", "Whispers of Winter", "White Sands", "Cozy Embrace", "Luna's Secret"] },
    { id: "burner", name: "Luxury Wax Burner", price: 14.99, img: "assets/products/wax-burner-1-0.jpg", w: 3 },
    { id: "wick-cutter", name: "Wick Cutter", price: 8, img: "assets/candle-wick-cutter.jpg", w: 2 },
    { id: "snuffer", name: "Snuffer", price: 8, img: "assets/candle-snuffer.jpg", w: 2 },
    { id: "tealights", name: "Unscented Tealights", price: 3.5, img: "assets/products/unscented-tealights-clear-cup-0.jpg", w: 2 },
    { id: "fibre-reeds", name: "Fibre Reeds", price: 3.5, img: "assets/fibre-reeds.jpg", w: 2 }
  ];
  // Delivery rule used by the redesign (free from £55). The live shop uses £80; this is still to be decided.
  const FREE_FROM = 55, POSTAGE = 3.95, SERVICE = "Royal Mail Tracked 48";
  const DAYS = 90, KEEP = "eldeva-demo-orders";

  const FIRST = ["Amelia", "Priya", "Sophie", "Hannah", "Grace", "Olivia", "Charlotte", "Emily", "Jas", "Aisha", "Lucy", "Megan", "Rachel", "Holly", "Zara", "Ellie", "Laura", "Simran", "Chloe", "Natalie", "Fiona", "Kirsty", "Daniel", "James", "Tom", "Harpreet", "Ruth", "Beth", "Imogen", "Nadia"];
  const LAST = ["Clarke", "Patel", "Hughes", "Evans", "Kaur", "Thompson", "Wright", "Robinson", "Begum", "Walker", "Bennett", "Sandhu", "Morgan", "Price", "Fletcher", "Ahmed", "Lloyd", "Gill", "Harrison", "Reid"];
  const STREETS = ["Elm Grove", "Station Road", "Victoria Street", "Church Lane", "Mill Close", "Park Avenue", "The Crescent", "Orchard Way", "Kingsway", "Rosemary Drive", "Holly Bank", "Meadow View"];
  const TOWNS = [["Leeds", "LS6"], ["Manchester", "M20"], ["Birmingham", "B13"], ["Bristol", "BS7"], ["Glasgow", "G12"], ["Cardiff", "CF14"], ["Nottingham", "NG5"], ["Leicester", "LE2"], ["York", "YO24"], ["Brighton", "BN1"], ["Wolverhampton", "WV6"], ["Edinburgh", "EH10"], ["Sheffield", "S11"], ["Reading", "RG4"], ["Norwich", "NR2"], ["London", "N16"], ["London", "SE22"], ["Coventry", "CV5"]];
  const GIFTS = ["Happy birthday Mum, love you lots x", "Congratulations on the new house! Love, Priya & Sam", "A little something to say thank you. Grace", "Happy anniversary, here's to many more cosy evenings x", "Get well soon, thinking of you. Hannah", "Merry Christmas! Love from all of us", "Welcome to the team!"];
  const NOTES = ["Asked on Instagram for extra tissue paper.", "Repeat customer, popped in a free tealight last time.", "Leave with a neighbour if out (from her email)."];

  // small seeded random generator so the sample data is the same on every page load
  let seed = 1830;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const weighted = a => { let r = rnd() * a.reduce((s, x) => s + x.w, 0); return a.find(x => (r -= x.w) < 0) || a[a.length - 1]; };
  const round2 = v => Math.round(v * 100) / 100;
  const digits = n => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");

  const customers = Array.from({ length: 80 }, (_, i) => {
    const first = FIRST[i % FIRST.length], last = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length], [town, out] = pick(TOWNS);
    return {
      name: `${first} ${last}`, email: `${first}.${last}${i > 29 ? i : ""}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, ""),
      phone: `07700 900${digits(3)}`,
      address: { line1: `${1 + Math.floor(rnd() * 140)} ${pick(STREETS)}`, line2: rnd() < .2 ? `Flat ${1 + Math.floor(rnd() * 12)}` : "", town, postcode: `${out} ${Math.floor(rnd() * 9) + 1}${String.fromCharCode(65 + Math.floor(rnd() * 26))}${String.fromCharCode(65 + Math.floor(rnd() * 26))}` },
      w: i < 12 ? 6 : 1 // a dozen regulars order far more often
    };
  });

  function build() {
    const now = Date.now(), today = new Date(); today.setHours(0, 0, 0, 0);
    const out = [];
    for (let d = DAYS - 1; d >= 0; d--) {
      const day = new Date(today); day.setDate(day.getDate() - d);
      const wk = day.getDay(), base = (wk === 0 || wk === 6 ? 3.4 : 2.3) * (0.75 + 0.5 * (DAYS - d) / DAYS);
      const count = Math.max(0, Math.round(base + (rnd() - 0.5) * 3));
      const times = Array.from({ length: count }, () => day.getTime() + (7 + rnd() * 16) * 3600e3).sort((a, b) => a - b);
      for (const t of times) {
        const c = weighted(customers), lines = [], n = rnd() < .55 ? 1 : rnd() < .75 ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const p = weighted(PRODUCTS), variant = p.variants ? pick(p.variants) : "";
          const same = lines.find(l => l.productId === p.id && l.variant === variant);
          if (same) same.qty++; else lines.push({ productId: p.id, name: p.name, variant, qty: rnd() < .12 ? 2 : 1, price: p.price, img: p.img });
        }
        const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.price, 0)), postage = subtotal >= FREE_FROM ? 0 : POSTAGE;
        if (t <= now) out.push({
          paidAt: new Date(t).toISOString(), customer: { name: c.name, email: c.email, phone: c.phone }, address: { ...c.address },
          items: lines, subtotal, postage, total: round2(subtotal + postage), service: SERVICE,
          giftNote: rnd() < .14 ? pick(GIFTS) : "", notes: rnd() < .04 ? [{ at: new Date(t + 3600e3).toISOString(), text: pick(NOTES) }] : [],
          status: "posted", tracking: "", sentAt: "", postedAt: ""
        });
      }
    }
    // number from the oldest, then work out where each order is: the newest few still need sending,
    // the next few have gone to Click & Drop, and everything older has been posted
    out.forEach((o, i) => { o.number = 1001 + i; });
    out.slice().reverse().forEach((o, i) => {
      const paid = Date.parse(o.paidAt);
      if (i < 6) o.status = "to-send";
      else {
        o.tracking = `QF${digits(9)}GB`; o.sentAt = new Date(Math.min(now - 600e3, paid + 5 * 3600e3)).toISOString();
        if (i < 10) o.status = "sent";
        else { o.status = "posted"; o.postedAt = new Date(paid + 22 * 3600e3).toISOString(); }
      }
    });
    return out;
  }

  const all = build();
  const kept = (() => { try { return JSON.parse(sessionStorage.getItem(KEEP) || "{}"); } catch { return {}; } })();
  for (const o of all) if (kept[o.number]) Object.assign(o, kept[o.number]);
  function save(o) {
    kept[o.number] = { status: o.status, tracking: o.tracking, sentAt: o.sentAt, postedAt: o.postedAt, notes: o.notes };
    try { sessionStorage.setItem(KEEP, JSON.stringify(kept)); } catch {}
  }

  const wait = () => new Promise(r => setTimeout(r, 120 + Math.random() * 160)); // feels like a network call
  const copy = o => structuredClone(o);
  const find = number => { const o = all.find(x => x.number === Number(number)); if (!o) throw new Error("That order doesn't exist."); return o; };

  return {
    demo: true,
    /** every order, newest first */
    async list() { await wait(); return all.slice().reverse().map(copy); },
    async get(number) { await wait(); return copy(find(number)); },
    async sendToClickDrop(number) {
      await wait(); const o = find(number);
      if (o.status !== "to-send") throw new Error("This order has already gone to Royal Mail.");
      Object.assign(o, { status: "sent", tracking: `QF${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}GB`, sentAt: new Date().toISOString() });
      save(o); return copy(o);
    },
    async markPosted(number) {
      await wait(); const o = find(number);
      if (o.status === "to-send") throw new Error("Send it to Click & Drop first, so it has a tracking number.");
      Object.assign(o, { status: "posted", postedAt: o.postedAt || new Date().toISOString() });
      save(o); return copy(o);
    },
    async addNote(number, text) {
      await wait(); const o = find(number);
      o.notes.push({ at: new Date().toISOString(), text: String(text).slice(0, 500) });
      save(o); return copy(o);
    },
    /** forget the changes made in this tab */
    reset() { try { sessionStorage.removeItem(KEEP); } catch {} }
  };
})();
