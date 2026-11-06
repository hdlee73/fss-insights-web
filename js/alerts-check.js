// 알림 확인: 앱(웹)이 열려 있는 동안 30분마다, 그리고 다시 볼 때 새 글을 확인해 '새 소식'에 모으고
// 메뉴 배지와 브라우저 알림(허락한 경우)으로 알린다. 웹은 닫혀 있을 때 확인하지 못한다(앱과 다른 점).
// - 키워드: 금융감독원·금융위원회 보도자료 제목에 키워드가 들어 있으면
// - 새 자료: 고른 기관의 보도자료·금융리포트가 새로 올라오면
// - 참고 자료실: 새 파일이 올라오면
// - 오늘의 브리핑: 매일 정한 시각 이후 처음 확인할 때 한 번
import { api, store } from "./core.js";

const INTERVAL = 30 * 60 * 1000;
const MAX_INBOX = 200;

export const settings = () => ({
  keywords: store.get("alerts.keywords", []),
  agencies: store.get("alerts.agencies", []),
  library: store.get("alerts.library", false),
  briefing: store.get("alerts.briefing", false),
  briefingTime: store.get("alerts.briefingTime", "08:30"),
});
export const inbox = () => store.get("alerts.inbox", []);
export const unread = () => inbox().filter((x) => !x.read).length;
export function markAllRead() {
  store.set("alerts.inbox", inbox().map((x) => ({ ...x, read: true })));
  badge();
}
export function clearInbox() {
  store.set("alerts.inbox", []);
  badge();
}
async function badge() {
  try {
    (await import("./app.js")).setBadge("alerts", unread());
  } catch {
    /* 메뉴가 아직 없으면 다음에 */
  }
}

/** 처음 보는 목록이면 '이미 본 것'으로만 기록하고 알리지 않는다(켠 순간 묵은 글이 한꺼번에 울리지 않게). */
function diff(key, hits) {
  if (!hits) return [];
  const seenKey = "alerts.seen." + key;
  const seen = store.get(seenKey, null);
  const links = [...new Set(hits.map((h) => h.link))];
  if (!seen) {
    store.set(seenKey, links.slice(0, 500));
    return [];
  }
  const known = new Set(seen);
  const fresh = hits.filter((h, i, a) => !known.has(h.link) && a.findIndex((x) => x.link === h.link) === i);
  if (fresh.length) store.set(seenKey, [...fresh.map((h) => h.link), ...seen].slice(0, 1000));
  return fresh;
}

const titleHas = (title, keyword) => {
  const words = keyword.trim().split(/\s+/).filter(Boolean);
  const exclude = words.filter((w) => w.startsWith("-") && w.length > 1).map((w) => w.slice(1).toLowerCase());
  const terms = words.filter((w) => !w.startsWith("-")).join(" ").split(/\s*\|\s*|\s+OR\s+/i).filter(Boolean);
  const t = title.toLowerCase();
  if (exclude.some((w) => t.includes(w))) return false;
  return terms.some((term) => term.split(/\s+/).every((w) => t.includes(w.toLowerCase())));
};

let running = null;
/** 지금 확인. 새로 찾은 항목 수를 돌려준다. */
export function checkNow({ force = false } = {}) {
  return (running ||= run(force).finally(() => (running = null)));
}

async function run(force) {
  const s = settings();
  const last = store.get("alerts.lastCheck", 0);
  if (!force && Date.now() - last < INTERVAL - 60000) return 0;
  store.set("alerts.lastCheck", Date.now());
  const found = [];
  const { AGENCIES, agencyById, latest, latestCustom, customList } = await import("./lib/agencies.js");

  // 보도자료(키워드용 금감원·금융위 + 새 자료로 고른 기관)
  const wanted = new Set(s.agencies);
  if (s.keywords.length) ["FSS", "FSC"].forEach((id) => wanted.add(id));
  const lists = new Map();
  await Promise.all([...wanted].map(async (id) => {
    if (id.startsWith("c:")) {
      const inst = [...customList("PRESS"), ...customList("RESEARCH")].find((x) => "c:" + x.url === id);
      if (inst) lists.set(id, await latestCustom(inst, 20).catch(() => null));
      return;
    }
    const a = agencyById(id);
    if (a) lists.set(id, await latest(a, 20).catch(() => null));
  }));
  for (const id of s.agencies) {
    const items = lists.get(id);
    const a = agencyById(id);
    const kind = a ? (a.group === "PRESS" ? "보도자료" : "금융리포트") : "새 자료";
    diff("m." + id, items && items.map((x) => ({ title: x.title, link: x.link, source: x.label }))).forEach((x) => found.push({ ...x, kind }));
  }
  for (const k of s.keywords) {
    const hits = ["FSS", "FSC"].flatMap((id) => (lists.get(id) || []).filter((x) => titleHas(x.title, k)).map((x) => ({ title: x.title, link: x.link, source: x.label })));
    const ok = ["FSS", "FSC"].some((id) => lists.get(id));
    diff("k." + k, ok ? hits : null).forEach((x) => found.push({ ...x, kind: `키워드 ‘${k}’` }));
  }

  // 참고 자료실: 최상위부터 하위 폴더까지(최대 30곳)
  if (s.library) {
    try {
      const files = [];
      const queue = [[null, ""]];
      for (let n = 0; queue.length && n < 30; n++) {
        const [id, name] = queue.shift();
        const r = await api("/library/list", id ? { folder: id } : null);
        for (const it of r.items || []) it.folder ? queue.push([it.id, it.name]) : files.push({ title: it.name, link: "#/library?f=" + encodeURIComponent(it.parent || ""), id: it.id, source: name || "자료실" });
      }
      diff("library", files.map((f) => ({ ...f, link: f.id }))).forEach((f) => found.push({ title: f.title, link: "#/library?q=" + encodeURIComponent(f.title), source: f.source, kind: "참고 자료실" }));
    } catch {
      /* 다음에 다시 */
    }
  }

  // 오늘의 브리핑: 정한 시각 이후 하루 한 번
  if (s.briefing) {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const [hh, mm] = s.briefingTime.split(":").map(Number);
    if (store.get("alerts.briefingDay", "") !== day && now.getHours() * 60 + now.getMinutes() >= hh * 60 + mm) {
      store.set("alerts.briefingDay", day);
      found.push({ title: `오늘의 브리핑 · ${now.getMonth() + 1}월 ${now.getDate()}일`, link: "#/briefing", source: "브리핑", kind: "오늘의 브리핑" });
    }
  }

  if (found.length) {
    const at = Date.now();
    store.set("alerts.inbox", [...found.map((x) => ({ ...x, at, read: false })), ...inbox()].slice(0, MAX_INBOX));
    notify(found);
  }
  badge();
  return found.length;
}

async function notify(found) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const title = found.length === 1 ? found[0].kind : `새 소식 ${found.length}건`;
  const body = found.slice(0, 5).map((x) => `[${x.source}] ${x.title}`).join("\n") + (found.length > 5 ? `\n외 ${found.length - 5}건` : "");
  const opts = { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "fss-alerts", data: { url: "#/alerts" } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, opts);
    new Notification(title, opts).onclick = () => (window.focus(), (location.hash = "#/alerts"));
  } catch {
    /* 알림을 띄우지 못하면 배지만 */
  }
}

export async function checkInBackground() {
  badge();
  const any = () => {
    const s = settings();
    return s.keywords.length || s.agencies.length || s.library || s.briefing;
  };
  const tick = () => any() && document.visibilityState === "visible" && checkNow().catch(() => {});
  setTimeout(tick, 4000);
  setInterval(tick, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", tick);
}
