// Service worker for Expenses.
// Strategy: network-first for the HTML shell + scripts + expenses.json (fresh when online, last-good
// when offline); cache-first for static assets. Bump VERSION to force a cache refresh on the next visit.
const VERSION = "ex-v4";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png",
  // Every <script src> in index.html MUST be listed here: the page calls into them at parse time,
  // so one uncached script offline breaks the whole app, not just its own feature.
  "./scripts/accounts.js", "./scripts/vault.js", "./scripts/expenses-calc.js", "./scripts/expenses-sync.js", "./scripts/expenses-capture.js", "./scripts/undo-delete.js",
  "./fonts/chakrapetch-400.woff2", "./fonts/chakrapetch-500.woff2", "./fonts/chakrapetch-600.woff2", "./fonts/chakrapetch-700.woff2", "./fonts/rubik-400.woff2", "./fonts/rubik-500.woff2", "./fonts/rubik-600.woff2", "./fonts/spacemono-400.woff2", "./fonts/spacemono-700.woff2"];
const DATA = ["expenses.json"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    const IMMUTABLE = /(\.woff2|\.png|\.svg)$/;
    await Promise.all(SHELL.concat(DATA).map((u) =>
      fetch(new Request(u, IMMUTABLE.test(u) ? {} : { cache: "reload" })).then((r) => r.ok && c.put(u, r)).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("ex-") && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never touch the GitHub API calls
  const isData = DATA.some((d) => url.pathname.endsWith("/" + d));
  const isShell = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html") || url.pathname.includes("/scripts/");
  if (isData || isShell) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: "no-cache" });
        if (res && res.ok) { const c = await caches.open(VERSION); c.put(req, res.clone()); return res; }
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || res;
      } catch (_) {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || (await caches.match("./index.html")) || Response.error();
      }
    })());
  } else {
    e.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.ok) { const c = await caches.open(VERSION); c.put(req, res.clone()); }
      return res;
    })());
  }
});

self.addEventListener("message", (e) => {
  if (e.data === "version") { const p = e.ports && e.ports[0]; if (p) p.postMessage(VERSION); }
});
