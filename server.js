// Eldeva site server: serves the website plus the admin at /admin (products, plus market sales, events and stock).
// Products live in data/products.json. Every save rewrites catalog.js, which the public pages load,
// so the shop itself stays a plain static site.
//
//   node server.js                     start on PORT (default 8765)
//   node server.js add-user <name>     create or reset a login (asks for the password)
//   node server.js remove-user <name>  delete a login
//
// Behind an HTTPS proxy, set TRUST_PROXY=1 so login cookies are marked Secure.
// TEST_MODE=1 runs a test copy: data lives in a throwaway folder that starts from the real products only,
// with one login from TEST_USER and TEST_PASSWORD, so nothing testers do reaches data/.
"use strict";
const http = require("http"), fs = require("fs"), fsp = fs.promises, path = require("path"), crypto = require("crypto");

const ROOT = __dirname;
const TEST_MODE = process.env.TEST_MODE === "1";
const DATA = TEST_MODE ? path.join(require("os").tmpdir(), "eldeva-test") : path.join(ROOT, "data"), UPLOADS = path.join(ROOT, "uploads");
const PRODUCTS_FILE = path.join(DATA, "products.json"), USERS_FILE = path.join(DATA, "users.json"), CATALOG_FILE = path.join(ROOT, "catalog.js");
const PORT = Number(process.env.PORT) || 8765;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const SESSION_MS = 12 * 60 * 60 * 1000;

const TYPES = ["candles", "diffusers", "melts", "gifts", "accessories"];
const MOODS = ["", "soft-mornings", "hot-summer", "sunlit-citrus", "golden-cafe"];
const LINES = ["", "core", "bundles"];
const SEASONS = ["", "autumn", "winter", "spring", "summer"];

/* ---------- passwords and logins ---------- */
const hashPassword = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  ({ salt, hash: crypto.scryptSync(pw, salt, 64).toString("hex") });
function checkPassword(pw, rec) {
  const a = Buffer.from(hashPassword(pw, rec.salt).hash, "hex"), b = Buffer.from(rec.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const readUsers = () => { try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch { return {}; } };

function askPassword(prompt) {
  if (process.env.ELDEVA_PASSWORD) return Promise.resolve(process.env.ELDEVA_PASSWORD);
  return new Promise(resolve => {
    const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(prompt)) process.stdout.write(prompt); };
    rl.question(prompt, a => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

async function cli([cmd, name]) {
  if (!name || !/^[a-z0-9._-]{2,32}$/i.test(name)) { console.error("Usage: node server.js add-user|remove-user <username>  (letters, numbers, . _ -)"); process.exit(1); }
  fs.mkdirSync(DATA, { recursive: true });
  const users = readUsers(), key = name.toLowerCase();
  if (cmd === "remove-user") {
    if (!users[key]) { console.error(`No user called ${name}.`); process.exit(1); }
    delete users[key]; fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(`Removed ${name}.`); return;
  }
  const pw = await askPassword(`Password for ${name} (at least 10 characters): `);
  if (pw.length < 10) { console.error("That password is too short. Use at least 10 characters."); process.exit(1); }
  users[key] = { name, ...hashPassword(pw) };
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
  console.log(`Saved login for ${name}.`);
}

/* ---------- sessions, rate limits ---------- */
const sessions = new Map(); // token -> { user, exp }
const attempts = new Map(); // ip -> { n, reset }
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}
function sessionOf(req) {
  const t = cookies(req).eldeva_admin, s = t && sessions.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(t); return null; }
  return s;
}
const secure = req => req.socket.encrypted || (TRUST_PROXY && req.headers["x-forwarded-proto"] === "https");
const ipOf = req => (TRUST_PROXY && (req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress;
function rateLimited(ip) {
  const now = Date.now(), a = attempts.get(ip);
  if (!a || a.reset < now) { attempts.set(ip, { n: 1, reset: now + 15 * 60 * 1000 }); return false; }
  a.n++; return a.n > 8;
}

/* ---------- products ---------- */
let writing = Promise.resolve(); // one save at a time, across every data file
function queued(fn) { const p = writing.then(fn); writing = p.catch(() => {}); return p; }
const readProducts = async () => JSON.parse(await fsp.readFile(PRODUCTS_FILE, "utf8"));
async function writeAtomic(file, text) { const tmp = file + ".tmp"; await fsp.writeFile(tmp, text); await fsp.rename(tmp, file); }
function catalogSource(list) {
  const pub = list.filter(p => p.visible).map(p => {
    const o = { id: p.id, name: p.name, type: p.type, price: p.price, img: p.img };
    if (p.alt) o.alt = p.alt;
    o.meta = p.meta;
    if (p.variants.length) o.variants = p.variants;
    if (p.sizes && p.sizes.length) { o.sizes = p.sizes.map(s => s.img ? { id: s.id, name: s.name, price: s.price, img: s.img } : { id: s.id, name: s.name, price: s.price }); o.from = Math.min(...p.sizes.map(s => s.price)); }
    if (p.mood) o.mood = p.mood;
    if (p.icon) o.icon = true;
    if (p.line) o.line = p.line;
    if (p.season) o.season = p.season;
    return o;
  });
  const json = JSON.stringify(pub, null, 1).replace(/</g, "\\u003c");
  return `/* Generated by server.js from data/products.json. Edit products at /admin, not here. */\nwindow.CATALOG = ${json};\n`;
}
function saveProducts(list) {
  return queued(async () => {
    await writeAtomic(PRODUCTS_FILE, JSON.stringify(list, null, 2) + "\n");
    await writeAtomic(CATALOG_FILE, catalogSource(list));
  });
}

class Invalid extends Error { constructor(field, msg) { super(msg); this.field = field; } }
const IMG_PATH = /^(assets|uploads)\/[A-Za-z0-9._/-]+\.(jpe?g|png|webp)$/i;
function imagePath(v, field, required) {
  v = typeof v === "string" ? v.trim() : "";
  if (!v) { if (required) throw new Invalid(field, "Add a photo."); return ""; }
  if (!IMG_PATH.test(v) || v.includes("..") || !fs.existsSync(path.join(ROOT, v))) throw new Invalid(field, "That photo can't be found. Upload it again.");
  return v;
}
function text(v, field, max, required) {
  v = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (required && !v) throw new Invalid(field, "This can't be empty.");
  if (v.length > max) throw new Invalid(field, `Keep this under ${max} characters.`);
  return v;
}
const oneOf = (v, list, field) => { v = v ?? ""; if (!list.includes(v)) throw new Invalid(field, "Pick one of the options."); return v; };
const cleanPrice = (v, field) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 10000) throw new Invalid(field, "Enter a price like 30 or 24.99."); return Math.round(n * 100) / 100; };
// Sizes each have their own price, and optionally a code and photo. The first size is the default,
// so the product's own price is the first size's price. Ids stay the same when a size is renamed, as stock is counted against them.
function cleanSizes(list) {
  if (!Array.isArray(list)) return [];
  if (list.length > 12) throw new Invalid("sizes", "Keep it to 12 sizes or fewer.");
  const seen = new Set(), names = new Set();
  return list.map(s => {
    const name = text(s && s.name, "sizes", 30);
    if (!name) throw new Invalid("sizes", "Give every size a name, like 30cl.");
    if (names.has(name.toLowerCase())) throw new Invalid("sizes", `There are two sizes called ${name}. Give each size a different name.`);
    names.add(name.toLowerCase());
    let id = /^[a-z0-9-]{1,40}$/.test(s.id || "") ? s.id : slug(name);
    while (seen.has(id)) id += "-2";
    seen.add(id);
    const out = { id, name, price: cleanPrice(s.price, "sizes"), sku: text(s.sku, "sizes", 40) };
    const img = imagePath(s.img, "sizes", false); if (img) out.img = img;
    return out;
  });
}
function cleanProduct(b) {
  const sizes = cleanSizes(b.sizes), price = sizes.length ? sizes[0].price : cleanPrice(b.price, "price");
  const variants = (Array.isArray(b.variants) ? b.variants : []).map(v => text(v, "variants", 60)).filter(Boolean);
  if (variants.length > 20) throw new Invalid("variants", "Keep it to 20 options or fewer.");
  return {
    name: text(b.name, "name", 80, true),
    type: oneOf(b.type, TYPES, "type"),
    price,
    meta: text(b.meta, "meta", 140),
    sku: text(b.sku, "sku", 40),
    sizes,
    img: imagePath(b.img, "img", true),
    alt: imagePath(b.alt, "alt", false),
    variants,
    mood: oneOf(b.mood, MOODS, "mood"),
    line: oneOf(b.line, LINES, "line"),
    season: oneOf(b.season, SEASONS, "season"),
    icon: b.icon === true,
    visible: b.visible !== false
  };
}
const slug = s => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "product";

async function saveUpload(body) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.data || "");
  if (!m) throw new Invalid("file", "Use a JPG, PNG or WebP photo.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 8 * 1024 * 1024) throw new Invalid("file", "That photo is too large (8MB max).");
  const magic = { jpeg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46] }[m[1]];
  if (!magic.every((b, i) => buf[i] === b)) throw new Invalid("file", "That file isn't a valid photo.");
  await fsp.mkdir(UPLOADS, { recursive: true });
  const name = `${slug(String(body.name || "photo"))}-${crypto.randomBytes(4).toString("hex")}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  await fsp.writeFile(path.join(UPLOADS, name), buf);
  return `uploads/${name}`;
}

/* ---------- http helpers ---------- */
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, { "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/.test(req.headers["content-type"] || "")) return reject(new Invalid("body", "Expected JSON."));
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Invalid("body", "That upload is too large.")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Invalid("body", "Couldn't read that request.")); } });
    req.on("error", reject);
  });
}
// in-person sales, events, deals and stock (see lib/sales.js)
const sales = require("./lib/sales.js")({ DATA, readProducts, readBody, send, Invalid, text, queued, writeAtomic });
const sameOrigin = req => { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } };

/* ---------- api ---------- */
async function api(req, res, url) {
  const route = url.pathname.replace(/^\/api/, ""), method = req.method;
  if (method !== "GET" && !sameOrigin(req)) return send(res, 403, { error: "Blocked: request didn't come from this site." });
  if (route === "/mode") return send(res, 200, { test: TEST_MODE });

  if (route === "/login" && method === "POST") {
    if (rateLimited(ipOf(req))) return send(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
    const b = await readBody(req, 4096), rec = readUsers()[String(b.username || "").toLowerCase()];
    if (!rec || !checkPassword(String(b.password || ""), rec)) return send(res, 401, { error: "That username or password isn't right." });
    attempts.delete(ipOf(req));
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { user: rec.name, exp: Date.now() + SESSION_MS });
    return send(res, 200, { user: rec.name }, { "Set-Cookie": `eldeva_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure(req) ? "; Secure" : ""}` });
  }
  const s = sessionOf(req);
  if (route === "/logout" && method === "POST") {
    if (s) sessions.delete(cookies(req).eldeva_admin);
    return send(res, 200, { ok: true }, { "Set-Cookie": "eldeva_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
  }
  if (!s) return send(res, 401, { error: "Please sign in." });
  if (route === "/me") return send(res, 200, { user: s.user, options: { TYPES, MOODS, LINES, SEASONS } });

  if (route === "/upload" && method === "POST") return send(res, 200, { path: await saveUpload(await readBody(req, 12 * 1024 * 1024)) });

  if (route === "/products" && method === "GET") return send(res, 200, await readProducts());
  if (route === "/products" && method === "POST") {
    const p = cleanProduct(await readBody(req, 64 * 1024)), list = await readProducts();
    let id = slug(p.name), n = 2; while (list.some(x => x.id === id)) id = `${slug(p.name)}-${n++}`;
    const created = { id, ...p };
    list.push(created); await saveProducts(list);
    return send(res, 201, created);
  }
  if (route === "/products/order" && method === "POST") {
    const { ids } = await readBody(req, 64 * 1024), list = await readProducts();
    if (!Array.isArray(ids) || ids.length !== list.length || !list.every(p => ids.includes(p.id))) return send(res, 400, { error: "The product list changed. Reload and try again." });
    await saveProducts(ids.map(id => list.find(p => p.id === id)));
    return send(res, 200, { ok: true });
  }
  const m = /^\/products\/([a-z0-9-]+)$/.exec(route);
  if (m) {
    const list = await readProducts(), i = list.findIndex(p => p.id === m[1]);
    if (i < 0) return send(res, 404, { error: "That product doesn't exist any more." });
    if (method === "PUT") { list[i] = { id: list[i].id, ...cleanProduct(await readBody(req, 64 * 1024)) }; await saveProducts(list); return send(res, 200, list[i]); }
    if (method === "DELETE") { list.splice(i, 1); await saveProducts(list); return send(res, 200, { ok: true }); }
  }
  if (await sales(route, method, req, res, s.user) !== false) return;
  return send(res, 404, { error: "Not found." });
}

/* ---------- static files ---------- */
const TYPES_MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".webm": "video/webm", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml"
};
const PRIVATE = /^\/(data|lib|node_modules)(\/|$)|\/\.|^\/server\.js$/;
async function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, "Bad request"); }
  if (p === "/admin") { res.writeHead(301, { Location: "/admin/" }); return res.end(); }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, path.normalize(p));
  const mime = TYPES_MIME[path.extname(file).toLowerCase()];
  if (!file.startsWith(ROOT + path.sep) || PRIVATE.test(p) || !mime) return send(res, 404, "Not found");
  let st;
  try { st = await fsp.stat(file); } catch { return send(res, 404, "Not found"); }
  if (!st.isFile()) return send(res, 404, "Not found");
  const headers = {
    "Content-Type": mime, "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff",
    "Cache-Control": /^(text|application)\//.test(mime) || p === "/catalog.js" ? "no-cache" : p.startsWith("/uploads/") ? "public, max-age=31536000, immutable" : "public, max-age=3600"
  };
  if (TEST_MODE) headers["X-Robots-Tag"] = "noindex"; // keep the test copy of the shop out of search results
  if (p.startsWith("/admin/")) Object.assign(headers, { "X-Robots-Tag": "noindex", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && (range[1] || range[2])) { // videos need byte ranges (Safari)
    let start = range[1] ? Number(range[1]) : st.size - Number(range[2]), end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    if (start < 0 || start >= st.size || end < start) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
    end = Math.min(end, st.size - 1);
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
    return req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ---------- start ---------- */
async function start() {
  if (TEST_MODE) {
    await fsp.rm(DATA, { recursive: true, force: true });
    await fsp.mkdir(DATA, { recursive: true });
    await fsp.copyFile(path.join(ROOT, "data", "products.json"), PRODUCTS_FILE);
    const { TEST_USER: name, TEST_PASSWORD: pw } = process.env;
    if (name && pw) fs.writeFileSync(USERS_FILE, JSON.stringify({ [name.toLowerCase()]: { name, ...hashPassword(pw) } }, null, 2), { mode: 0o600 });
    console.log(`Test mode: data in ${DATA}, starting from the real products only.`);
  }
  if (!fs.existsSync(PRODUCTS_FILE)) { console.error("data/products.json is missing."); process.exit(1); }
  await fsp.writeFile(CATALOG_FILE, catalogSource(await readProducts())); // keep catalog.js in step with the data
  if (!Object.keys(readUsers()).length) console.warn("No admin logins yet. Create one with: node server.js add-user <name>");
  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      await serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof Invalid) return send(res, 400, { error: e.message, field: e.field });
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: "Something went wrong saving that. Try again." });
    }
  }).listen(PORT, () => console.log(`Eldeva running at http://localhost:${PORT}  (admin: /admin/)`));
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "add-user" || cmd === "remove-user") cli([cmd, ...rest]);
else if (cmd) { console.error(`Unknown command: ${cmd}`); process.exit(1); }
else start();
