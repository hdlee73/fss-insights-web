// 알림: 새 소식(모아 보기)과 알림 설정(키워드·기관·참고 자료실·오늘의 브리핑, 브라우저 알림 허용).
import { setHeader } from "../app.js";
import { dialog, h, icon, iconButton, message, openUrl, store, tabs, toast } from "../core.js";
import { checkNow, clearInbox, inbox, markAllRead, settings } from "../alerts-check.js";
import { AGENCIES, GROUPS, customList } from "../lib/agencies.js";

export async function render(root, params, ctx) {
  setHeader("알림", "키워드·기관 새 글, 참고 자료실, 오늘의 브리핑");
  const view = params.view === "settings" ? 1 : 0;
  root.append(tabs(["새 소식", "알림 설정"], view, (i) => ctx.go(i ? { view: "settings" } : {}, { replace: true })));
  if (view) return settingsView(root, ctx);
  newsView(root, ctx);
}

function when(at) {
  const d = new Date(at);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}.${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function newsView(root, ctx) {
  const list = h("div", { class: "card list" });
  const label = h("div", { class: "section-label" });
  root.append(label, list);
  const draw = () => {
    const items = inbox();
    const s = settings();
    const anyOn = s.keywords.length || s.agencies.length || s.library || s.briefing;
    label.replaceChildren(...[h("span", null, items.length ? `최근 ${items.length}건 · 안 읽음 ${items.filter((x) => !x.read).length}건` : "새 소식"),
      h("div", { class: "acts" },
        iconButton("refresh-cw", "지금 확인", async () => {
          toast("새 글을 확인하는 중…");
          const n = await checkNow({ force: true });
          toast(n ? `새 소식 ${n}건` : "새 소식이 없습니다.");
          draw();
        }),
        items.length ? h("button", { type: "button", class: "link-more", onclick: () => (markAllRead(), draw()) }, "모두 읽음") : null,
        items.length ? h("button", { type: "button", class: "link-more", onclick: async () => (await dialog({ title: "새 소식 지우기", text: "모아 둔 새 소식을 모두 지웁니다.", ok: "지우기", danger: true })) && (clearInbox(), draw()) }, "지우기") : null)].filter(Boolean));
    if (!items.length) {
      list.replaceChildren(message(anyOn ? "아직 새 소식이 없습니다. 웹이 열려 있는 동안 30분마다 확인합니다." : "켜 둔 알림이 없습니다. ‘알림 설정’에서 키워드나 기관을 골라 주세요.", anyOn ? {} : { action: "알림 설정", onAction: () => ctx.go({ view: "settings" }) }));
      return;
    }
    list.replaceChildren(...items.map((x, i) => h("div", { class: "item" + (x.read ? "" : " unread") },
      h("div", { class: "body", role: "link", tabindex: 0, onclick: () => {
        const all = inbox();
        all[i] = { ...all[i], read: true };
        store.set("alerts.inbox", all);
        x.link.startsWith("#") ? (location.hash = x.link) : (openUrl(x.link), draw());
      } },
        h("div", { class: "t" }, x.read ? null : h("span", { class: "dot" }), x.title),
        h("div", { class: "m" }, h("span", { class: "tag" }, x.kind), `${x.source} · ${when(x.at)}`)))));
  };
  draw();
  markSeenLater();
}
// 새 소식 화면을 보면 메뉴 배지를 지운다(항목의 읽음 표시는 그대로).
function markSeenLater() {
  import("../app.js").then((m) => m.setBadge("alerts", 0));
}

function settingsView(root, ctx) {
  const s = settings();
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const permCard = h("section", { class: "card" },
    h("div", { class: "ch" }, icon("bell"), h("h3", null, "브라우저 알림")),
    h("p", { class: "note" }, perm === "granted" ? "허용됨: 새 소식이 있으면 화면 알림도 띄웁니다." : perm === "denied" ? "브라우저 설정에서 이 사이트의 알림이 막혀 있습니다. 주소창의 사이트 설정에서 허용해 주세요." : perm === "unsupported" ? "이 브라우저는 알림을 지원하지 않습니다. 메뉴 배지로만 알려 드립니다." : "허용하면 새 소식이 있을 때 화면 알림을 띄웁니다."),
    perm === "default" ? h("button", { type: "button", class: "btn sm", style: { marginTop: "8px" }, onclick: async () => (await Notification.requestPermission(), ctx.go({ view: "settings" }, { replace: true })) }, "알림 허용") : null,
    h("p", { class: "note", style: { marginTop: "6px" } }, "웹은 열려 있는 동안(설치한 웹 앱 포함) 30분마다, 그리고 다시 볼 때 확인합니다. 창을 닫으면 확인하지 않습니다."));

  // 키워드: 최근 24시간 뉴스 + 금감원·금융위 보도자료 제목
  const kwList = h("div", { class: "lw-chips" });
  const drawKw = () => {
    const kws = store.get("alerts.keywords", []);
    kwList.replaceChildren(...(kws.length ? kws.map((k) => h("span", { class: "lw-chip" }, h("button", { type: "button" }, k),
      h("button", { type: "button", class: "x", title: "삭제", "aria-label": `${k} 삭제`, onclick: () => (store.set("alerts.keywords", store.get("alerts.keywords", []).filter((x) => x !== k)), drawKw()) }, icon("x")))) : [h("span", { class: "note" }, "등록한 키워드가 없습니다.")]));
  };
  const kwInput = h("input", { type: "text", placeholder: "예) 내부통제 · 가상자산|코인 · 보험 -자동차", "aria-label": "알림 키워드" });
  const addKw = () => {
    const v = kwInput.value.trim();
    if (!v) return;
    const kws = store.get("alerts.keywords", []);
    if (!kws.includes(v)) store.set("alerts.keywords", [...kws, v].slice(0, 30));
    kwInput.value = "";
    drawKw();
  };
  kwInput.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), addKw()));
  drawKw();
  const kwCard = h("section", { class: "card" },
    h("div", { class: "ch" }, icon("search"), h("h3", null, "키워드 알림")),
    h("p", { class: "note" }, "최근 24시간 뉴스(뉴스검색과 같은 방식)와 금융감독원·금융위원회 보도자료 제목에 키워드가 들어 있으면 알립니다. ‘|’는 또는, ‘-낱말’은 제외입니다."),
    h("div", { class: "search", style: { margin: "8px 0" } }, kwInput, h("button", { type: "button", class: "btn sm", onclick: addKw }, "추가")),
    kwList);

  // 기관별 새 자료
  const on = new Set(s.agencies);
  const toggle = (id, checked) => {
    checked ? on.add(id) : on.delete(id);
    store.set("alerts.agencies", [...on]);
  };
  const agencyCard = (group, title) => {
    const rows = [...AGENCIES.filter((a) => a.group === group).map((a) => [a.id, a.label]), ...customList(group).map((x) => ["c:" + x.url, x.name])];
    return h("section", { class: "card" },
      h("div", { class: "ch" }, icon(group === "PRESS" ? "file-text" : "book-open"), h("h3", null, title)),
      h("div", { class: "al-list" }, rows.map(([id, label]) => h("label", { class: "lw-opt" }, h("input", { type: "checkbox", checked: on.has(id), onchange: (e) => toggle(id, e.target.checked) }), label))));
  };

  const libBox = h("input", { type: "checkbox", checked: s.library, onchange: (e) => store.set("alerts.library", e.target.checked) });
  const brBox = h("input", { type: "checkbox", checked: s.briefing, onchange: (e) => store.set("alerts.briefing", e.target.checked) });
  const brTime = h("input", { type: "time", value: s.briefingTime, onchange: (e) => store.set("alerts.briefingTime", e.target.value || "08:30") });
  const etc = h("section", { class: "card" },
    h("div", { class: "ch" }, icon("bell"), h("h3", null, "그 밖의 알림")),
    h("label", { class: "lw-opt" }, libBox, "참고 자료실에 새 자료가 올라오면"),
    h("label", { class: "lw-opt" }, brBox, "오늘의 브리핑 매일", brTime, "이후 처음 볼 때"));

  root.append(h("div", { class: "stack", style: { marginTop: "12px" } },
    permCard, kwCard,
    h("div", { class: "grid2 al-grid" }, agencyCard("PRESS", `새 ${GROUPS.PRESS.noun} 알림`), agencyCard("RESEARCH", "새 금융리포트 알림")),
    etc,
    h("p", { class: "note" }, "처음 켠 기관·키워드는 지금 있는 글을 ‘이미 본 것’으로 기록하고, 그다음부터 새로 올라온 글만 알립니다.")));
}
