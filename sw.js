// Service worker: makes the planner installable and usable offline.
// App files: served from cache, refreshed in the background. Data (data/*.json): network first,
// cached copy when offline, so the schedule is always as fresh as the connection allows.
// Bump VERSION whenever assets change.
const VERSION = "2026-10-25l";
const SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "assets/styles.css", "assets/data.js", "assets/app.js", "assets/assistant.js",
  "assets/icons/icon-192.png", "assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("shell-" + VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== "shell-" + VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only same-origin GETs; never the admin page or anything cross-origin (chat, fonts, CDNs).
  if (e.request.method !== "GET" || url.origin !== location.origin || /admin/.test(url.pathname)) return;

  if (url.pathname.includes("/data/")) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open("data").then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }

  // Pages: network first, so an update is visible on the next open; saved copy when offline.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open("shell-" + VERSION).then((c) => c.put("./", copy));
      return res;
    }).catch(() => caches.match("./")));
    return;
  }

  // Versioned assets (?v=...): cache first; a new version is a new URL, so it's fetched fresh.
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open("shell-" + VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
