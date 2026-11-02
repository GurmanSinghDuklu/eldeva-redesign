/* Eldeva shared behaviour for the inner pages: bag, menu, reveals, smooth scroll. */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* Catalogue: comes from catalog.js, which the admin (/admin) rewrites on every save */
window.CATALOG = window.CATALOG || [];
window.esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const byName = n => CATALOG.find(p => n === p.name || n.startsWith(p.name + " · "));
const extra = {}; // items added on the homepage that aren't in the catalogue
// Bag names look like "Sweet Plum · 20cl · Rose". A product with sizes uses the size named, or its first size if none is.
const sizeOf = n => { const p = byName(n); if (!p || !p.sizes) return null; const parts = n.slice(p.name.length).split(" · "); return p.sizes.find(s => parts.includes(s.name)) || p.sizes[0]; };
const priceOf = n => sizeOf(n)?.price ?? (byName(n) || {}).price ?? (extra[n] || {}).price ?? 30;
const imgOf = n => sizeOf(n)?.img || (byName(n) || {}).img || (extra[n] || {}).img || "assets/white-sands.jpg";

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

/* Bag: kept for the visit so it follows you between pages. Free UK delivery over £80. */
const FREE = 80, gbp = v => "£" + v.toFixed(2);
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
    [...bagItems].map(([name, q]) => `<li><img src="${esc(imgOf(name))}" alt="">
      <div><b>${esc(name)}</b><small>${gbp(priceOf(name))} each</small>
        <div class="qty"><button data-q="-1" data-n="${esc(name)}" aria-label="One fewer ${esc(name)}">−</button><span>${q}</span><button data-q="1" data-n="${esc(name)}" aria-label="One more ${esc(name)}">+</button></div></div>
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


/* Newsletter */
const listForm = $("#listForm");
listForm && listForm.addEventListener("submit", e => {
  e.preventDefault(); const v = $("#email").value.trim(), m = $("#listMsg"); m.hidden = false;
  m.textContent = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "You're on the list. Welcome to Eldeva." : "Enter an email address like name@example.co.uk.";
});
