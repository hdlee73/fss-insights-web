// 서비스 워커: 화면 파일을 미리 받아 두어(오프라인에서도 열림) 빠르게 띄우고, 새 버전이 오면 교체한다.
// 배포할 때 VERSION이 바뀌면 브라우저가 새 서비스 워커를 받고, 화면에 "새 버전" 띠가 뜬다(js/app.js).
const VERSION = "1.0.6";
const CACHE = "fss-web-" + VERSION;
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "icons/icon-192.png",
  "icons/favicon.svg",
  "js/app.js",
  "js/core.js",
  "js/icons.js",
  "js/alerts-check.js",
  "js/lib/htmllist.js",
  "js/lib/agencies.js",
  "js/lib/market.js",
  "js/lib/regulatory.js",
  "js/lib/sanctions.js",
  "js/lib/xlsx.js",
  "js/lib/law-core.js",
  "js/lib/hwpx.js",
  "js/lib/report.js",
  "js/usage.js",
  "assets/hwpx/header.xml",
  "assets/hwpx/section_head.xml",
  "assets/hwpx/first_paragraph.xml",
  "assets/hwpx/content.hpf",
  "assets/hwpx/version.xml",
  "assets/hwpx/settings.xml",
  "assets/hwpx/container.xml",
  "assets/hwpx/manifest.xml",
  "assets/hwpx/container.rdf",
  "js/screens/briefing.js",
  "js/screens/market.js",
  "js/screens/fisis.js",
  "js/screens/sanction.js",
  "js/screens/dart.js",
  "js/screens/law.js",
  "js/screens/releases.js",
  "js/screens/regulatory.js",
  "js/screens/library.js",
  "js/screens/sites.js",
  "js/screens/alerts.js",
  "js/screens/info.js",
];
const FONT_HOSTS = ["cdn.jsdelivr.net"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("fss-web-") && k !== CACHE && k !== CACHE + "-font").map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // 화면 파일: 저장본을 먼저 쓰고, 없으면 받아서 저장(새 버전은 서비스 워커 교체로 들어온다).
    e.respondWith(
      caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && url.pathname.match(/\.(js|css|png|svg|json|webmanifest|html)$|\/$/)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
    );
  } else if (FONT_HOSTS.includes(url.hostname)) {
    // 글꼴: 저장본을 쓰고 뒤에서 새로 받아 둔다.
    e.respondWith(
      caches.open(CACHE + "-font").then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => (res.ok && c.put(req, res.clone()), res)).catch(() => hit);
        return hit || net;
      })
    );
  }
  // 서버(Worker)·기관 사이트 요청은 저장하지 않고 그대로 보낸다.
});

// 알림을 누르면 열린 창을 앞으로 가져오거나 새로 연다.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "#/alerts", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const w = list.find((c) => c.url.startsWith(self.registration.scope));
      if (w) return w.focus().then(() => w.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
