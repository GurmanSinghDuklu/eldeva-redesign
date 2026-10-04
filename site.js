/* Eldeva shared behaviour for the inner pages: bag, evening mode, menu, reveals, smooth scroll. */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* Catalogue: names, prices and photos from the live store */
window.CATALOG = [
  { id: "sweet-plum", name: "Sweet Plum", type: "candles", price: 30, img: "assets/sweet-plum.jpg", alt: "assets/products/sweet-plum-30cl-candle-alt.jpg", meta: "30cl soy candle · vibrant, juicy", mood: "hot-summer", icon: true },
  { id: "white-sands", name: "White Sands", type: "candles", price: 30, img: "assets/white-sands.jpg", alt: "assets/products/white-sands-30cl-candle-alt.jpg", meta: "30cl soy candle · clean, airy", mood: "soft-mornings", icon: true },
  { id: "lunas-secret", name: "Luna's Secret", type: "candles", price: 30, img: "assets/lunas-secret.jpg", alt: "assets/products/lunas-secret-30cl-candle-alt.jpg", meta: "30cl soy candle · bright, floral", mood: "sunlit-citrus" },
  { id: "cozy-embrace", name: "Cozy Embrace", type: "candles", price: 30, img: "assets/cozy-embrace.jpg", alt: "assets/products/cozy-embrace-30cl-candle-alt.jpg", meta: "30cl soy candle · coffee, warm", mood: "golden-cafe" },
  { id: "velvet-peony", name: "Velvet Peony", type: "diffusers", price: 30, img: "assets/velvet-peony.jpg", alt: "assets/products/velvet-peony-reed-diffuser-alt.jpg", meta: "Reed diffuser · plush, floral", mood: "sunlit-citrus", icon: true },
  { id: "linen-breeze", name: "Linen Breeze", type: "diffusers", price: 30, img: "assets/linen-breeze.jpg", alt: "assets/products/linen-breeze-reed-diffiuser-alt.jpg", meta: "Reed diffuser · crisp, clean", mood: "soft-mornings" },
  { id: "ivory-petal", name: "Ivory Petal", type: "diffusers", price: 30, img: "assets/ivory-petal.jpg", alt: "assets/products/ivory-petal-reed-diffuser-alt.jpg", meta: "Reed diffuser · soft white florals", mood: "soft-mornings" },
  { id: "rustic-havana", name: "Rustic Havana", type: "diffusers", price: 30, img: "assets/rustic-havana.jpg", alt: "assets/products/rustic-havana-reed-diffuser-alt.jpg", meta: "Reed diffuser · warm, smoky", mood: "golden-cafe" },
  { id: "refills", name: "Diffuser Refills with Reeds", type: "diffusers", price: 24.99, img: "assets/products/diffuser-reed-refills-0.jpg", meta: "Refill bottle and fresh reeds", variants: ["Velvet Peony", "Rustic Havana", "Linen Breeze", "Ivory Petal"] },
  { id: "wax-melts", name: "Wax Melts", type: "melts", price: 8, img: "assets/wax-melts.jpg", alt: "assets/pages/shop-melts.jpg", meta: "Flower and butterfly shapes", variants: ["Luna's Secret", "Cozy Embrace", "White Sands", "Sweet Plum"] },
  { id: "ritual-set", name: "The Wax Ritual Set", type: "gifts", price: 25.99, img: "assets/set-1.jpg", alt: "assets/pages/shop-gifts.jpg", meta: "Burner, tealight and melts, boxed", variants: ["Sweet Plum", "Maple Haze", "Whispers of Winter", "White Sands", "Cozy Embrace", "Luna's Secret"] },
  { id: "burner", name: "Luxury Wax Burner", type: "accessories", price: 14.99, img: "assets/products/wax-burner-1-0.jpg", alt: "assets/pages/shop-burner.jpg", meta: "White ceramic, takes a tealight" },
  { id: "wick-cutter", name: "Wick Cutter", type: "accessories", price: 8, img: "assets/candle-wick-cutter.jpg", meta: "Trim to 5mm before every burn" },
  { id: "snuffer", name: "Snuffer", type: "accessories", price: 8, img: "assets/candle-snuffer.jpg", meta: "Put the flame out without smoke" },
  { id: "tealights", name: "Unscented Tealights", type: "accessories", price: 3.5, img: "assets/products/unscented-tealights-clear-cup-0.jpg", meta: "Clear cup, for the wax burner" },
  { id: "fibre-reeds", name: "Fibre Reeds", type: "accessories", price: 3.5, img: "assets/fibre-reeds.jpg", meta: "Fresh reeds for any diffuser" }
];
const byName = n => CATALOG.find(p => n === p.name || n.startsWith(p.name + " · "));
const extra = {}; // items added on the homepage that aren't in the catalogue
const priceOf = n => (byName(n) || {}).price ?? (extra[n] || {}).price ?? 30;
const imgOf = n => (byName(n) || {}).img || (extra[n] || {}).img || "assets/white-sands.jpg";

/* Wrap words in spans so headings can rise in word by word */
function wordify(el, cb) {
  const walk = node => [...node.childNodes].forEach(n => {
    if (n.nodeType !== 3) return walk(n);
    const frag = document.createDocumentFragment();
    n.textContent.split(/(\s+)/).forEach(t => { if (!t) return; if (/^\s+$/.test(t)) frag.append(t); else frag.append(cb(t)); });
    n.replaceWith(frag);
  });
  walk(el);
}
let wi = 0;
$$("[data-split]").forEach(el => wordify(el, t => {
  const w = document.createElement("span"); w.className = "w";
  const s = document.createElement("span"); s.textContent = t; s.style.setProperty("--i", wi++);
  w.append(s); return w;
}));
let fw = 0;
$$("[data-words]").forEach(el => wordify(el, t => {
  const s = document.createElement("span"); s.className = "w"; s.textContent = t; s.style.setProperty("--wi", fw++); return s;
}));

/* Smooth scroll */
let lenis = null;
if (!reduce && window.Lenis) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
window.scrollToY = y => lenis ? lenis.scrollTo(y, { duration: 1.4 }) : scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
document.addEventListener("click", e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const id = a.getAttribute("href"); if (id.length < 2) return;
  const t = document.getElementById(id.slice(1)); if (!t) return;
  e.preventDefault(); scrollToY(t.getBoundingClientRect().top + scrollY - 90);
});

/* Header tucks up once you scroll */
const hdr = $("#hdr");
const onScroll = () => hdr.classList.toggle("stuck", scrollY > 40);
addEventListener("scroll", onScroll, { passive: true }); onScroll();

/* Reveal on enter (plays by itself, never scrubbed) */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15 });
window.observeReveal = root => $$(".reveal, .track", root).forEach(el => io.observe(el));
observeReveal(document);

/* Flame film: the window opens and the words rise when it comes into view */
$$(".film").forEach(film => new IntersectionObserver(([e]) => {
  if (e.isIntersecting && e.intersectionRatio >= 0.35) film.classList.add("play");
  else if (!e.isIntersecting) film.classList.remove("play");
}, { threshold: [0, 0.35] }).observe(film));

/* Videos only decode while on screen */
const vidIO = new IntersectionObserver(es => es.forEach(e => {
  const v = e.target;
  if (e.isIntersecting && !reduce) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
}), { rootMargin: "100px" });
$$("video[data-onscreen]").forEach(v => vidIO.observe(v));

/* Candlelight that follows the cursor */
const glow = $("#glow");
if (glow && matchMedia("(pointer:fine)").matches && !reduce) {
  let gx = innerWidth / 2, gy = innerHeight / 2, tx = gx, ty = gy;
  addEventListener("pointermove", e => { tx = e.clientX; ty = e.clientY; glow.style.opacity = 1; });
  document.addEventListener("pointerleave", () => glow.style.opacity = 0);
  (function g() { gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12; glow.style.transform = `translate(${gx}px,${gy}px)`; requestAnimationFrame(g); })();
}

/* Bag: kept for the visit so it follows you between pages. Free UK delivery over £55. */
const FREE = 55, gbp = v => "£" + v.toFixed(2);
const BAG_KEY = "eldeva-bag";
const bagItems = new Map();
try { (JSON.parse(sessionStorage.getItem(BAG_KEY)) || []).forEach(([n, q, price, img]) => { bagItems.set(n, q); extra[n] = { price, img }; }); } catch (e) {}
const countEl = $("#bagCount"), toast = $("#toast"), drawer = $("#drawer"), scrim = $("#scrim");
let tt;
window.showToast = (msg, ms = 2200) => { toast.textContent = msg; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), ms); };
function renderBag() {
  let n = 0, total = 0;
  bagItems.forEach((q, name) => { n += q; total += q * priceOf(name); });
  try { sessionStorage.setItem(BAG_KEY, JSON.stringify([...bagItems].map(([n, q]) => [n, q, priceOf(n), imgOf(n)]))); } catch (e) {}
  countEl.textContent = n;
  $("#bagTotal").textContent = gbp(total);
  const left = Math.max(0, FREE - total);
  $("#shipMsg").innerHTML = left > 0 ? `You're <b>${gbp(left)}</b> away from free UK delivery` : `You've unlocked <b>free UK delivery</b>`;
  $("#shipBar").style.width = Math.min(100, total / FREE * 100) + "%";
  $("#bagList").innerHTML = n === 0 ? `<li class="dr-empty" style="display:block;border:0">Your bag is empty. Something warm is waiting in the shop.</li>` :
    [...bagItems].map(([name, q]) => `<li><img src="${imgOf(name)}" alt="">
      <div><b>${name}</b><small>${gbp(priceOf(name))} each</small>
        <div class="qty"><button data-q="-1" data-n="${name}" aria-label="One fewer ${name}">−</button><span>${q}</span><button data-q="1" data-n="${name}" aria-label="One more ${name}">+</button></div></div>
      <span class="dr-price">${gbp(q * priceOf(name))}</span></li>`).join("");
  $("#checkout").disabled = n === 0;
}
window.addToBag = name => {
  bagItems.set(name, (bagItems.get(name) || 0) + 1); renderBag();
  countEl.classList.add("bump"); setTimeout(() => countEl.classList.remove("bump"), 300);
  showToast(`${name} added to your bag`);
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-add]");
  if (b) return addToBag(b.dataset.add);
  const q = e.target.closest("[data-q]");
  if (q) { const n = q.dataset.n, v = (bagItems.get(n) || 0) + +q.dataset.q; v > 0 ? bagItems.set(n, v) : bagItems.delete(n); renderBag(); }
});
function setDrawer(open) {
  drawer.classList.toggle("open", open); drawer.setAttribute("aria-hidden", !open); scrim.hidden = !open;
  if (open) { lenis && lenis.stop(); setTimeout(() => $("#drawerClose").focus(), 50); } else { lenis && lenis.start(); }
}
$("#bagBtn").onclick = () => setDrawer(true);
$("#drawerClose").onclick = () => setDrawer(false);
scrim.onclick = () => setDrawer(false);
addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("open")) setDrawer(false); });
$("#checkout").onclick = () => showToast("This is a concept mockup, so checkout isn't connected", 2600);
renderBag();

/* Mobile menu */
const burger = $("#burger"), mnav = $("#mnav");
burger.onclick = () => { const open = mnav.hidden; mnav.hidden = !open; burger.setAttribute("aria-expanded", open); };
mnav.addEventListener("click", e => { if (e.target.closest("a")) { mnav.hidden = true; burger.setAttribute("aria-expanded", false); } });

/* Mark the page you're on */
const here = location.pathname.split("/").pop() || "index.html";
$$(".pill ul a, .mnav a").forEach(a => { if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page"); });

/* Evening mode, remembered across pages */
const moodBtn = $("#moodBtn"), moodLbl = $("#moodLbl");
function setEvening(on) {
  document.documentElement.dataset.mood = on ? "evening" : "day";
  moodBtn.setAttribute("aria-pressed", on); moodLbl.textContent = on ? "Blow it out" : "Light the candle";
  try { localStorage.setItem("eldeva-mood", on ? "evening" : "day"); } catch (e) {}
  dispatchEvent(new Event("eldeva:mood"));
}
let saved = null; try { saved = localStorage.getItem("eldeva-mood"); } catch (e) {}
setEvening(saved === "evening");
moodBtn.addEventListener("click", () => setEvening(document.documentElement.dataset.mood !== "evening"));

/* Newsletter */
const listForm = $("#listForm");
listForm && listForm.addEventListener("submit", e => {
  e.preventDefault(); const v = $("#email").value.trim(), m = $("#listMsg"); m.hidden = false;
  m.textContent = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "You're on the list. Welcome to Eldeva." : "Enter an email address like name@example.co.uk.";
});
