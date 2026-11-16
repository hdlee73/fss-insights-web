// 공지 회전 배너(맨 위). 관리자가 서버(/admin/notices)에서 쓴 공지를 5초마다 돌려 보여 주고, 누르면 본문을 펼친다.
// '숨김'은 지금 보이는 공지를 하루 동안 숨긴다(새 공지는 다시 뜬다). 서버가 안 되면 아무것도 그리지 않는다.
import { api, h, store } from "./core.js";

const ROTATE_MS = 5000;
const REFRESH_MS = 10 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hiddenIds = () => { const v = store.get("notices.hidden", null); return v && v.day === today() ? v.ids : []; };

/** 서버 응답에서 쓸 수 있는 공지만 남긴다. */
export function cleanNotices(data) {
  return (Array.isArray(data?.notices) ? data.notices : [])
    .filter((n) => n && typeof n.title === "string" && n.title.trim())
    .map((n) => ({ id: n.id, title: n.title.trim(), body: String(n.body || "").trim(), urgent: n.level === "urgent" }));
}

export function installNotices(host) {
  if (!host) return;
  let list = [], idx = 0, expanded = false, timer = null;

  const visible = () => list.filter((n) => !hiddenIds().includes(n.id));
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  function draw() {
    const v = visible();
    stop();
    host.replaceChildren();
    host.hidden = !v.length;
    if (!v.length) return;
    idx = ((idx % v.length) + v.length) % v.length;
    const n = v[idx];
    const nav = v.length > 1 ? [
      h("button", { type: "button", class: "nb-nav", "aria-label": "이전 공지", onclick: () => { idx--; draw(); } }, "‹"),
      h("span", { class: "nb-cnt" }, `${idx + 1}/${v.length}`),
      h("button", { type: "button", class: "nb-nav", "aria-label": "다음 공지", onclick: () => { idx++; draw(); } }, "›"),
    ] : [];
    host.append(h("div", { class: "nb" + (n.urgent ? " urgent" : ""), role: "status" },
      h("div", { class: "nb-row" },
        h("button", { type: "button", class: "nb-t", "aria-expanded": String(expanded), onclick: () => { if (n.body) { expanded = !expanded; draw(); } } }, h("span", { "aria-hidden": "true" }, "📢 "), n.title),
        ...nav,
        h("button", { type: "button", class: "nb-hide", onclick: () => { store.set("notices.hidden", { day: today(), ids: [...new Set([...hiddenIds(), ...v.map((x) => x.id)])] }); expanded = false; idx = 0; draw(); } }, "숨김")),
      expanded && n.body ? h("div", { class: "nb-body" }, n.body) : null));
    if (v.length > 1 && !expanded) timer = setInterval(() => { idx++; draw(); }, ROTATE_MS);
  }
  async function load() {
    try {
      list = cleanNotices(await api("/notices"));
    } catch { /* 오프라인이면 이전 목록을 그대로 둔다 */ }
    draw();
  }
  load();
  setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
}
