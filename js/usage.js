// 익명 사용 통계(앱 UsageStats.kt와 같은 방식). 하루 한 번 서버에 (랜덤 기기ID, 웹 버전, 날짜, 메뉴별 이용 횟수)만 보낸다.
// 이름·계정·검색어는 보내지 않으며 앱 정보에서 끌 수 있다. 지난 날짜는 메뉴 횟수와 함께, 오늘은 '사용함'만 보낸다.
// 서버의 관리자 화면(/admin)에서 버전 이름 'web-…'으로 앱과 구분된다.
import { APP_VERSION, SERVER, store } from "./core.js";

const KEEP_DAYS = 14;
const pad = (n) => String(n).padStart(2, "0");
const dayOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const enabled = () => store.get("usageStats", true);

function installId() {
  let id = store.get("usage.id", "");
  if (!/^[A-Za-z0-9-]{16,64}$/.test(id)) {
    id = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    store.set("usage.id", id);
  }
  return id;
}

/** 메뉴(화면)를 열 때마다. 이 브라우저에 날짜별 횟수만 쌓는다. */
export function recordMenu(label) {
  if (!enabled() || !label) return;
  const p = store.get("usage.pending", {});
  const day = dayOf();
  p[day] = p[day] || {};
  p[day][label] = (p[day][label] || 0) + 1;
  store.set("usage.pending", p);
}

/** 끄면 아직 보내지 않은 기록을 지운다. */
export function setEnabled(on) {
  store.set("usageStats", !!on);
  if (!on) store.set("usage.pending", {});
}

let sending = false;
/** 오늘 아직 보내지 않았거나 지난 날짜 기록이 남아 있으면 보낸다. 실패하면 다음에 다시. */
export async function sendIfNeeded() {
  if (!enabled() || sending || !navigator.onLine) return;
  const today = dayOf();
  const cutoff = dayOf(new Date(Date.now() - KEEP_DAYS * 86400000));
  const pending = Object.fromEntries(Object.entries(store.get("usage.pending", {})).filter(([d]) => d >= cutoff));
  const past = Object.keys(pending).filter((d) => d < today).sort().slice(-10);
  const includeToday = store.get("usage.last", "") !== today;
  if (!past.length && !includeToday) return;
  const days = [...past.map((d) => ({ d, m: pending[d] })), ...(includeToday ? [{ d: today, m: {} }] : [])];
  sending = true;
  try {
    const res = await fetch(SERVER + "/usage/ping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: installId(), v: "web-" + APP_VERSION, days }) });
    if (res.ok) {
      const now = Object.fromEntries(Object.entries(store.get("usage.pending", {})).filter(([d]) => d >= cutoff));
      past.forEach((d) => delete now[d]);
      store.set("usage.pending", now);
      store.set("usage.last", today);
    }
  } catch {
    // 오프라인·서버 오류는 다음에 다시
  } finally {
    sending = false;
  }
}
