// 앱 뼈대(v3.0): PC는 상단 내비(뉴스검색·금융시장 동향·소비자 지킴이 고정 + 전체 메뉴), 휴대폰은 하단 탭 5개(뉴스·시장·소비자·법령·전체=서랍), 주소(#/화면) 기반 이동, 업데이트 알림.
// 화면 이동은 모두 브라우저 기록에 남으므로 뒤로가기(버튼·제스처)는 앱을 닫지 않고 직전 화면으로 돌아간다.
import { APP_VERSION, DISCLAIMER_DETAIL, DISCLAIMER_SHORT, dialog, forget, freshness, h, icon, skeleton, store, toast } from "./core.js";
import { installQuickSearchKey, openQuickSearch } from "./quicksearch.js";

// 서랍 메뉴: [소제목, [[경로, 이름, 아이콘], …]] — 앱(FinanceNewsRadarApp.kt)의 drawerSections와 같은 순서.
// 소제목이 있는 묶음은 제목을 눌러 하위 메뉴를 접고 펼 수 있다(접은 상태는 기억한다).
export const MENU = [
  [null, null, [
    ["briefing", "오늘의 브리핑", "sun"],
    ["news", "뉴스검색", "newspaper"],
    ["market", "금융시장 동향 및 거시경제 지표", "trending-up"],
    ["law", "스마트 법령검색", "scale"],
    ["lawnews", "최근 금융관련 법령개정 소식", "file-text"],
    ["consumer", "금융소비자 지킴이", "shield-check"],
  ]],
  ["금융회사 현황 및 검사", "landmark", [
    ["fisis", "금융회사 주요 현황", "building-2"],
    ["sanction", "금융회사 제재 공시", "gavel"],
    ["finsim", "(베타)제재 양정 시뮬레이터", "calculator"],
  ]],
  ["기업공시 및 회계", "bar-chart-3", [
    ["dart", "기업 개황 및 공시(DART)", "building"],
    ["disclosure", "공시조사결과제재", "shield-alert"],
    ["audit", "회계감리 조치현황", "clipboard-check"],
    ["accsearch", "회계기준서·질의회신·지적사례", "book-marked"],
    ["sim", "(베타) 회계 양정 및 과징금 시뮬레이터", "calculator"],
  ]],
  [null, null, [
    ["crypto", "가상자산 시장 동향", "coins"],
  ]],
  ["금융관련 자료", "folder-open", [
    ["press", "금융당국 등 보도자료", "file-text"],
    ["regulatory", "유권해석·비조치의견서·행정지도", "badge-check"],
    ["research", "금융관련 리포트", "book-open"],
    ["library", "기타 참고자료", "folder-open"],
  ]],
  ["더보기", "ellipsis-vertical", [
    ["vault", "보관함(스크랩·메모)", "bookmark-check"],
    ["sites", "주요사이트", "globe"],
    ["alerts", "알림", "bell"],
    ["info", "앱정보", "info"],
  ]],
];
const ROUTES = Object.fromEntries(MENU.flatMap(([, , items]) => items.map(([id, label, ic]) => [id, { label, icon: ic }])));

// v3.0 내비: 어느 화면에서든 한 번에 열리는 3개 + 법령. 나머지는 '전체 메뉴'(PC 메가메뉴, 휴대폰 서랍).
const PINNED = [["news", "뉴스검색", "newspaper"], ["market", "금융시장 동향", "trending-up"], ["consumer", "소비자 지킴이", "shield-check"]];
const TABS = [["news", "뉴스검색", "newspaper"], ["market", "금융시장", "trending-up"], ["consumer", "소비자", "shield-check"], ["law", "법령", "scale"]];
const MEGA = [
  ["금융회사 현황·검사", ["fisis", "sanction", "finsim"]],
  ["기업공시·회계", ["dart", "disclosure", "audit", "accsearch", "sim"]],
  ["자료·더보기", ["lawnews", "press", "regulatory", "research", "library", "crypto", "vault", "sites", "info"]],
];

const loaders = {
  briefing: () => import("./screens/briefing.js"),
  news: () => import("./screens/news.js"),
  market: () => import("./screens/market.js"),
  fisis: () => import("./screens/fisis.js"),
  sanction: () => import("./screens/sanction.js"),
  dart: () => import("./screens/dart.js"),
  disclosure: () => import("./screens/disclosure.js"),
  audit: () => import("./screens/audit.js"),
  accsearch: () => import("./screens/accsearch.js"),
  sim: () => import("./screens/sim.js"),
  finsim: () => import("./screens/finsim.js"),
  consumer: () => import("./screens/consumer.js"),
  crypto: () => import("./screens/crypto.js"),
  law: () => import("./screens/law.js"),
  lawnews: () => import("./screens/lawnews.js"),
  vault: () => import("./screens/vault.js"),
  press: () => import("./screens/releases.js"),
  research: () => import("./screens/releases.js"),
  regulatory: () => import("./screens/regulatory.js"),
  library: () => import("./screens/library.js"),
  sites: () => import("./screens/sites.js"),
  alerts: () => import("./screens/alerts.js"),
  info: () => import("./screens/info.js"),
};

/** 현재 주소(#/press?agency=FSS)를 { id, params }로 읽는다. */
export function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  if (path === "risk") return { id: "fisis", params: { tool: "risk", ...params } }; // 옛 주소 호환
  const id = ROUTES[path] ? path : "briefing";
  return { id, params };
}

/** 다른 화면(또는 같은 화면의 다른 상태)으로 이동. replace면 기록을 늘리지 않는다. */
export function go(id, params = {}, { replace = false } = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
  const hash = `#/${id}${qs ? "?" + qs : ""}`;
  if (hash === location.hash) return render();
  if (replace) {
    history.replaceState(null, "", hash);
    render();
  } else location.hash = hash;
}

const side = document.getElementById("side");
const main = document.getElementById("content");
const titleEl = document.getElementById("title");
const subEl = document.getElementById("sub");
const actionsEl = document.getElementById("top-actions");
const mobile = matchMedia("(max-width: 860px)");

const favs = () => store.get("menu.favs", []).filter((id) => ROUTES[id]);
/** 메뉴 묶음 목록. 즐겨찾기가 있으면 맨 위에 '즐겨찾기' 묶음을 붙인다(항목은 원래 자리에도 그대로 남는다). */
function sections() {
  const list = favs();
  if (!list.length) return MENU;
  return [[FAV_HEAD, "star", list.map((id) => [id, ROUTES[id].label, ROUTES[id].icon])], ...MENU];
}
const FAV_HEAD = "즐겨찾기";

function toggleFav(id) {
  const now = favs();
  const on = !now.includes(id);
  store.set("menu.favs", on ? [...now, id] : now.filter((x) => x !== id));
  const top = side.scrollTop;
  buildMenu();
  buildMega();
  applyBadges();
  markCurrent();
  side.scrollTop = top;
  toast(on ? `즐겨찾기에 추가했습니다: ${ROUTES[id].label}` : "즐겨찾기에서 뺐습니다");
}

function buildMenu() {
  const favSet = new Set(favs());
  side.replaceChildren(
    h("div", { class: "brand" },
      h("img", { class: "logo", src: "icons/icon-192.png", alt: "" }),
      h("div", { class: "brand-t" }, h("b", null, "FSS Insights"), h("small", null, "웹 버전")),
      h("button", { class: "ib collapse", type: "button", title: "메뉴 접기", "aria-label": "메뉴 접기", onclick: toggleCollapse }, icon("panel-left"))),
    h("nav", { class: "menu" },
      sections().map(([head, gic, items]) => {
        const folded = head && folds().includes(head);
        return h("div", { class: "sec" + (head ? " grouped" : "") + (folded ? " folded" : ""), "data-head": head || "" },
          head ? h("button", { class: "sh grp", type: "button", "aria-expanded": String(!folded), title: folded ? `${head} 펼치기` : `${head} 접기`, onclick: () => toggleFold(head) },
            icon(gic), h("span", { class: "gl" }, head), h("span", { class: "n" }, folded ? String(items.length) : ""), icon(folded ? "chevron-down" : "chevron-up", "i chev")) : null,
          items.map(([id, label, ic]) => {
            const fav = favSet.has(id);
            return h("div", { class: "mr" },
              h("a", { class: "mi", href: `#/${id}`, "data-id": id, title: label, onclick: (e) => {
                if (!document.body.classList.contains("drawer")) return;
                e.preventDefault();
                closeDrawer(() => (location.hash = `#/${id}`));
              } }, icon(ic), h("span", null, label), h("em", { class: "badge", hidden: true })),
              h("button", { class: "fav" + (fav ? " on" : ""), type: "button", "aria-pressed": String(fav), title: fav ? "즐겨찾기 해제" : "즐겨찾기에 추가", "aria-label": `${label} ${fav ? "즐겨찾기 해제" : "즐겨찾기에 추가"}`, onclick: () => toggleFav(id) }, icon("star")));
          }));
      })),
    h("div", { class: "sidefoot" }, h("div", { class: "unofficial" }, "금융감독원 공식 사이트가 아닙니다"), `v${APP_VERSION}`)
  );
}

// ---- v3.0 내비게이션: PC 상단 바 + 메가메뉴, 휴대폰 하단 탭 ----
const tnav = document.getElementById("tnav");
const mega = document.getElementById("mega");
const btab = document.getElementById("btab");

function buildTopNav() {
  const link = (id, cls, ...kids) => h("a", { class: cls, href: `#/${id}`, "data-id": id }, ...kids);
  tnav.replaceChildren(
    link("briefing", "tn-brand", h("img", { class: "logo", src: "icons/icon-192.png", alt: "" }), h("b", null, "FSS Insights")),
    link("briefing", "tn-link", "홈"),
    ...PINNED.map(([id, label, ic]) => link(id, "tn-pill", icon(ic), label)),
    link("law", "tn-link", "스마트 법령검색"),
    h("button", { class: "tn-link tn-all", id: "tn-all", type: "button", "aria-expanded": "false", "aria-controls": "mega", onclick: toggleMega }, "전체 메뉴", icon("chevron-down")),
    h("span", { class: "tn-sp" }),
    h("button", { class: "tn-search", id: "qs-btn", type: "button", title: "저장된 기사·보도자료 검색 (Ctrl K)", onclick: openQuickSearch }, icon("search"), h("span", null, "검색 · Ctrl K")),
    h("a", { class: "ib tn-bell", href: "#/alerts", "data-id": "alerts", title: "알림", "aria-label": "알림" }, icon("bell"), h("em", { class: "badge", hidden: true })));
}

function buildMega() {
  const favSet = new Set(favs());
  const row = (id) => {
    const fav = favSet.has(id);
    const label = ROUTES[id].label;
    return h("div", { class: "mg-row" },
      h("a", { class: "mg-i", href: `#/${id}`, "data-id": id, title: label }, h("span", null, label), h("em", { class: "badge", hidden: true })),
      h("button", { class: "mg-fav" + (fav ? " on" : ""), type: "button", "aria-pressed": String(fav), title: fav ? "즐겨찾기 해제" : "즐겨찾기에 추가", "aria-label": `${label} ${fav ? "즐겨찾기 해제" : "즐겨찾기에 추가"}`, onclick: (e) => (e.stopPropagation(), toggleFav(id)) }, icon("star")));
  };
  const favs0 = favs();
  mega.replaceChildren(
    favs0.length ? h("div", { class: "mg-favs" }, h("b", null, "★ 즐겨찾기"), favs0.map((id) => h("a", { class: "mg-chip", href: `#/${id}`, "data-id": id }, ROUTES[id].label))) : null,
    h("div", { class: "mg-cols" }, MEGA.map(([head, ids]) => h("div", { class: "mg-col" }, h("h4", null, head), ids.map(row)))),
    h("div", { class: "mg-foot" }, "금융감독원 공식 사이트가 아닙니다 · v" + APP_VERSION + " · 항목 오른쪽 별로 즐겨찾기"));
}
function openMega() {
  const btn = document.getElementById("tn-all");
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const w = Math.min(880, innerWidth - 24);
  mega.style.width = w + "px";
  mega.style.left = Math.max(12, Math.min(r.left - 40, innerWidth - w - 12)) + "px";
  mega.style.top = tnav.getBoundingClientRect().bottom + "px";
  mega.hidden = false;
  btn.setAttribute("aria-expanded", "true");
}
function closeMega() {
  if (mega.hidden) return;
  mega.hidden = true;
  document.getElementById("tn-all")?.setAttribute("aria-expanded", "false");
}
function toggleMega() {
  mega.hidden ? openMega() : closeMega();
}

function buildTabs() {
  btab.replaceChildren(
    ...TABS.map(([id, label, ic]) => h("a", { class: "bt", href: `#/${id}`, "data-id": id }, icon(ic), h("span", null, label))),
    h("button", { class: "bt", id: "bt-all", type: "button", "aria-label": "전체 메뉴 열기", onclick: openDrawer }, icon("layout-grid"), h("span", null, "전체")));
}

/** 현재 화면에 해당하는 메뉴·탭·필 단추를 강조한다. */
function markCurrent() {
  const { id } = currentRoute();
  for (const a of document.querySelectorAll("[data-id]")) a.classList.toggle("on", a.dataset.id === id);
  const inMega = MEGA.some(([, ids]) => ids.includes(id));
  document.getElementById("tn-all")?.classList.toggle("on", inMega);
  document.getElementById("bt-all")?.classList.toggle("on", inMega || id === "briefing");
  for (const a of document.querySelectorAll("a[data-id].on")) a.setAttribute("aria-current", "page");
  for (const a of document.querySelectorAll("a[data-id]:not(.on)")) a.removeAttribute("aria-current");
}

const folds = () => store.get("menu.folds", []);
function toggleFold(head) {
  const now = folds();
  store.set("menu.folds", now.includes(head) ? now.filter((x) => x !== head) : [...now, head]);
  refreshFolds();
}
/** 접힘 상태를 화면에 반영한다. 현재 화면이 든 묶음이 접혀 있으면 제목을 강조한다. */
function refreshFolds(openCurrent = false) {
  const { id } = currentRoute();
  let list = folds();
  const head = MENU.find(([hd, , items]) => hd && items.some(([i]) => i === id))?.[0];
  if (openCurrent && head && list.includes(head)) {
    list = list.filter((x) => x !== head);
    store.set("menu.folds", list);
  }
  for (const sec of side.querySelectorAll(".sec")) {
    const hd = sec.dataset.head;
    if (!hd) continue;
    const folded = list.includes(hd);
    sec.classList.toggle("folded", folded);
    const btn = sec.querySelector("button.sh");
    const [, gic, items] = sections().find(([x]) => x === hd);
    btn.setAttribute("aria-expanded", String(!folded));
    btn.title = folded ? `${hd} 펼치기` : `${hd} 접기`;
    btn.classList.toggle("has-on", folded && (hd === head || (hd === FAV_HEAD && items.some(([i]) => i === id))));
    btn.replaceChildren(icon(gic), h("span", { class: "gl" }, hd), h("span", { class: "n" }, folded ? String(items.length) : ""), icon(folded ? "chevron-down" : "chevron-up", "i chev"));
  }
}

function toggleCollapse() {
  const collapsed = !document.body.classList.contains("collapsed");
  document.body.classList.toggle("collapsed", collapsed);
}
// 휴대폰 서랍은 기록을 하나 남겨, 열린 상태에서 뒤로가기를 하면 화면 이동 대신 서랍만 닫힌다.
let afterClose = null;
function openDrawer() {
  if (document.body.classList.contains("drawer")) return;
  document.body.classList.add("drawer");
  history.pushState({ drawer: true }, "", location.hash);
}
function closeDrawer(then) {
  if (!document.body.classList.contains("drawer")) return then?.();
  document.body.classList.remove("drawer");
  if (history.state?.drawer) {
    afterClose = then || null;
    history.back();
  } else then?.();
}
addEventListener("popstate", () => {
  document.body.classList.remove("drawer");
  const next = afterClose;
  afterClose = null;
  next?.();
});

/** 메뉴 옆 숫자 배지(알림 화면이 새 글 수를 표시). 서랍·메가메뉴·종 아이콘에 모두 표시한다. */
const badges = {};
function paintBadge(id, count) {
  for (const el of document.querySelectorAll(`[data-id="${id}"] .badge, [data-id="${id}"].badge`)) {
    el.hidden = !count;
    el.textContent = count > 99 ? "99+" : String(count || "");
  }
}
function applyBadges() {
  for (const [id, n] of Object.entries(badges)) paintBadge(id, n);
}
export function setBadge(id, count) {
  badges[id] = count;
  paintBadge(id, count);
}

let renderSeq = 0;
let currentScreen = null;

/** 화면 제목줄. 각 화면이 부른다. */
export function setHeader(title, sub = "", actions = []) {
  titleEl.textContent = title;
  subEl.textContent = sub;
  actionsEl.replaceChildren(...actions.filter(Boolean));
  document.title = `${title} · FSS Insights`;
}

let lastCountedId = null;
let shownId = null;

/** 헤더의 새로고침: 기억해 둔 자료를 모두 비우고 지금 화면을 다시 불러온다. */
export function refreshAll() {
  forget("");
  window.dispatchEvent(new Event("fss-refresh"));
  shownId = null; // 뼈대를 다시 보여 주며 처음부터 불러온다
  render();
}

// ---- 헤더 우측: 마지막 업데이트 시각 · 빠른 검색 · 새로고침 ----
const pad = (n) => String(n).padStart(2, "0");
const stamp = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
function paintFresh() {
  const el = document.getElementById("fresh-t");
  if (!el) return;
  const offline = !navigator.onLine;
  const stale = !!freshness.stale;
  const wrap = document.getElementById("fresh");
  wrap.classList.toggle("stale", !!stale || offline);
  const when = freshness.at ? stamp(freshness.at) : "-";
  el.replaceChildren(
    h("span", { class: "fresh-k" }, "마지막 업데이트: "), h("b", null, h("span", { class: "fresh-full" }, when), h("span", { class: "fresh-short" }, when.slice(5))),
    ...(stale || offline ? [h("span", { class: "fresh-tag" }, offline ? "오프라인 · 저장본" : "저장본")] : []));
  const btn = document.getElementById("fresh-btn");
  if (btn) btn.title = `새로고침 · 마지막 업데이트 ${when}${offline ? " (오프라인 · 저장본)" : stale ? " (저장본)" : ""}`;
  el.title = stale || offline ? "연결이 불안정해 마지막으로 저장해 둔 자료를 보여 주고 있습니다." : "자료를 마지막으로 정상 수신한 시각";
}
function setupFresh() {
  const wrap = document.getElementById("fresh");
  if (!wrap) return;
  const btn = document.getElementById("fresh-btn");
  btn.addEventListener("click", () => {
    btn.classList.add("busy");
    setTimeout(() => btn.classList.remove("busy"), 900);
    refreshAll();
  });
  document.getElementById("qs-btn")?.addEventListener("click", openQuickSearch);
  window.addEventListener("fss-fresh", paintFresh);
  addEventListener("online", () => (paintFresh(), toast("다시 연결되었습니다. 새로고침으로 최신 자료를 받을 수 있어요.")));
  addEventListener("offline", paintFresh);
  paintFresh();
}
async function render() {
  const seq = ++renderSeq;
  const { id, params } = currentRoute();
  markCurrent();
  closeMega();
  refreshFolds(id !== lastCountedId); // 다른 화면으로 옮겨 가면 그 화면이 든 묶음은 펼친다
  const route = ROUTES[id];
  setHeader(route.label);
  // 같은 화면 안에서 탭·조건만 바뀐 경우는 세지 않는다.
  if (id !== lastCountedId) {
    lastCountedId = id;
    import("./usage.js").then((u) => (u.recordMenu(route.label), u.pageView(id, route.label))).catch(() => {});
  }
  try {
    currentScreen?.leave?.();
  } catch {}
  // 다른 화면으로 옮길 때는 자료가 올 때까지 뼈대(스켈레톤)를 보여 준다. 같은 화면 안의 조건 변경은 그대로 둔다.
  if (shownId !== id) main.replaceChildren(h("div", { class: "screen" }, skeleton(6, "page")));
  let mod;
  try {
    mod = await loaders[id]();
  } catch (e) {
    main.replaceChildren(h("div", { class: "state err" }, "화면을 불러오지 못했습니다. 새로고침해 주세요."));
    return;
  }
  if (seq !== renderSeq) return;
  const root = h("div", { class: "screen screen-" + id });
  main.replaceChildren(root);
  shownId = id;
  main.scrollTop = 0;
  currentScreen = mod;
  try {
    await mod.render(root, params, { id, go: (p, opts) => go(id, p, opts), alive: () => seq === renderSeq });
  } catch (e) {
    console.error(e);
    if (seq === renderSeq) root.replaceChildren(h("div", { class: "state err" }, "화면 오류: " + (e.message || e)));
  }
}

// ---- 업데이트(서비스 워커) ----
// 새 버전이 올라오면 서비스 워커가 미리 받아 두고, 화면 위에 "새 버전" 띠를 띄운다. 누르면 바로 적용, 그냥 두면 다음 실행 때 적용.
let waitingWorker = null;
export function updateReady() {
  return !!waitingWorker;
}
export function applyUpdate() {
  if (waitingWorker) waitingWorker.postMessage("skipWaiting");
  else location.reload();
}
export async function checkForUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return false;
  await reg.update();
  return !!(reg.waiting || reg.installing);
}
function showUpdateBar(worker) {
  waitingWorker = worker;
  document.getElementById("update-bar")?.remove();
  document.body.append(
    h("div", { id: "update-bar" }, icon("refresh-cw"), h("span", null, "새 버전이 준비되었습니다."), h("button", { class: "btn sm", type: "button", onclick: applyUpdate }, "지금 적용"))
  );
}
function registerWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  // 개발 중(localhost)에는 저장본 때문에 고친 파일이 안 보이지 않도록 ?sw=1 일 때만 켠다.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !location.search.includes("sw=1")) return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBar(w);
      });
    });
    // 켜 둔 채로 오래 쓰는 경우를 위해 1시간마다 새 버전을 확인한다.
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  });
  // 처음 설치할 때(이전 서비스 워커가 없을 때)는 새로고침하지 않는다. 새 버전으로 바뀔 때만 다시 연다.
  let hasController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hasController) return void (hasController = true);
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

// ---- 시작 ----
buildMenu();
buildTopNav();
buildMega();
buildTabs();
// 접속할 때는 항상 메뉴를 펼친 상태로 시작한다(접기는 그때그때만).
document.body.classList.remove("collapsed");
// 휴대폰 헤더 왼쪽 집 버튼 = 오늘의 브리핑(홈). 전체 메뉴(서랍)는 하단 '전체' 탭이나 왼쪽 가장자리 밀기로 연다.
document.getElementById("hamb").addEventListener("click", () => (location.hash = "#/briefing"));
document.getElementById("title").addEventListener("click", () => mobile.matches && (location.hash = "#/briefing"));
document.addEventListener("click", (e) => !mega.hidden && !mega.contains(e.target) && !e.target.closest("#tn-all") && closeMega());
addEventListener("resize", closeMega);
// 휴대폰에서 글자를 입력하는 동안에는 하단 탭을 숨겨 키보드 위에 떠 있지 않게 한다.
addEventListener("focusin", (e) => {
  const t = e.target;
  if (mobile.matches && t.matches?.("textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range])")) document.body.classList.add("typing");
});
addEventListener("focusout", () => document.body.classList.remove("typing"));
document.getElementById("scrim").addEventListener("click", () => closeDrawer());
addEventListener("hashchange", render);
addEventListener("keydown", (e) => e.key === "Escape" && (closeMega(), closeDrawer()));
mobile.addEventListener("change", () => closeDrawer());
// 휴대폰: 화면 왼쪽 가장자리에서 오른쪽으로 밀면 메뉴가 열린다(앱과 같은 동작).
let touchX = null;
addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX < 24 ? e.touches[0].clientX : null), { passive: true });
addEventListener("touchmove", (e) => {
  if (touchX != null && e.touches[0].clientX - touchX > 60) {
    openDrawer();
    touchX = null;
  }
}, { passive: true });
addEventListener("offline", () => toast("인터넷 연결이 끊겼습니다. 마지막으로 저장된 자료를 보여 드립니다."));
setupFresh();
import("./notices.js").then((m) => m.installNotices(document.getElementById("notice-bar"))).catch(() => {});
installQuickSearchKey();
if (!location.hash) history.replaceState(null, "", "#/briefing");
render();
registerWorker();
// 처음 접속할 때 한 번: 비공식 사이트 안내. '확인'을 눌러야 다시 뜨지 않는다.
if (!store.get("disclaimer.ok")) {
  dialog({ title: "안내", body: h("div", { class: "stack" }, h("p", null, h("b", null, DISCLAIMER_SHORT)), h("p", { class: "note" }, DISCLAIMER_DETAIL)), ok: "확인", cancel: null })
    .then((ok) => ok && store.set("disclaimer.ok", true));
}
// v3.0 첫 실행 안내(새 내비게이션): 한 번만.
if (store.get("disclaimer.ok") && !store.get("whatsnew.3.0")) {
  dialog({ title: "FSS Insights 3.0 — 새 메뉴 구성", body: h("div", { class: "stack" },
    h("p", null, "뉴스검색·금융시장 동향·소비자 지킴이를 언제든 한 번에 열 수 있도록 메뉴를 바꿨습니다."),
    h("p", { class: "note" }, "PC: 위쪽 메뉴 바의 파란 단추 3개 + ‘전체 메뉴 ▾’에서 나머지 메뉴(즐겨찾기 별 포함). 휴대폰: 아래쪽 탭 5개(뉴스·시장·소비자·법령·전체). 모든 기능과 즐겨찾기는 그대로입니다.")), ok: "확인", cancel: null })
    .then((ok) => ok && store.set("whatsnew.3.0", true));
}
import("./alerts-check.js").then((m) => m.checkInBackground()).catch(() => {});
// 익명 사용 통계: 시작할 때와 다시 볼 때 하루 한 번 보낸다.
const sendUsage = () => import("./usage.js").then((u) => u.sendIfNeeded()).catch(() => {});
import("./usage.js").then((u) => u.trackActivity()).catch(() => {}); // 방문 횟수·사용 시간(화면이 보이는 동안 1분마다)
setTimeout(sendUsage, 3000);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && sendUsage());
