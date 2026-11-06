// 유권해석·비조치의견서·행정지도: 출처 탭 → 최근 20건(제목+내용 검색), 항목을 누르면 원문 게시글.
import { setHeader } from "../app.js";
import { dotDate, errorText, h, icon, iconButton, loading, message, openUrl, searchBox, share, store, tabs } from "../core.js";
import { SOURCES, cachedItems, load, matches, snippet } from "../lib/regulatory.js";

const loaded = new Map(); // 이번 실행에서 읽은 목록(출처별)
const queries = new Map();

export async function render(root, params, ctx) {
  setHeader("유권해석·비조치의견서·행정지도", "금융당국 유권해석, 비조치의견 및 행정지도 최근 20건");
  let sel = Math.max(0, SOURCES.findIndex((s) => s.id === (params.src || store.get("tab.reg", SOURCES[0].id))));
  const source = SOURCES[sel];
  root.append(tabs(SOURCES.map((s) => s.tab), sel, (i) => {
    store.set("tab.reg", SOURCES[i].id);
    ctx.go({ src: SOURCES[i].id }, { replace: true });
  }));
  root.append(h("a", { class: "banner", href: source.listUrl, target: "_blank", rel: "noopener" }, `${source.label} 사이트에서 보기`, icon("external-link")));
  const box = searchBox({ placeholder: `${source.tab} 제목+내용 검색`, value: queries.get(source.id) || "", onSearch: (q) => (queries.set(source.id, q), draw()) });
  box.input.addEventListener("input", () => {
    if (!box.input.value) (queries.set(source.id, ""), draw());
  });
  const label = h("div", { class: "section-label" });
  const list = h("div", { class: "card list" });
  root.append(box, label, list);

  let items = loaded.get(source.id) || cachedItems(source);
  let busy = false;
  let error = null;

  function row(item, q) {
    const meta = source.guidance
      ? [item.date ? "시행 " + dotDate(item.date) : null, item.dept].filter(Boolean)
      : [item.serial ? "일련번호 " + item.serial : null, item.date ? dotDate(item.date) : null].filter(Boolean);
    const status = item.inForce === true ? h("span", { class: "tag green" }, item.statusText || "시행중") : item.inForce === false ? h("span", { class: "tag" }, item.statusText || "종료") : item.statusText ? h("span", { class: "tag" }, item.statusText) : null;
    const snip = q ? snippet(item, q) : null;
    return h("div", { class: "item" },
      h("div", { class: "body", onclick: () => openUrl(item.link), role: "link", tabindex: 0 },
        h("div", { class: "t" }, item.title),
        snip ? h("div", { class: "note", style: { marginTop: "3px" } }, snip) : null,
        h("div", { class: "m" }, status, meta.join(" · "))),
      h("div", { class: "acts" }, iconButton("share-2", "제목과 링크 공유", () => share(item.title, item.link))));
  }

  function draw() {
    const q = (queries.get(source.id) || "").trim();
    const shown = q ? items.filter((x) => matches(x, q)) : items;
    label.replaceChildren(
      h("span", null, q ? `‘${q}’ 검색 결과 ${shown.length}건` : `최근 ${items.length || 20}건`),
      h("div", { class: "acts" }, iconButton("refresh-cw", "새로고침", refresh)));
    list.replaceChildren(...shown.map((x) => row(x, q)));
    if (busy && !items.length) list.append(loading());
    else if (busy) list.append(h("div", { class: "note", style: { padding: "8px 4px" } }, "내용을 읽는 중… (다 읽으면 내용까지 검색됩니다)"));
    if (error && !items.length) list.append(message(error, { error: true, action: "사이트에서 보기", onAction: () => openUrl(source.listUrl) }));
    else if (error) list.append(h("div", { class: "note", style: { padding: "8px 4px", color: "#9c2b2b" } }, "새로 읽지 못해 저장된 목록을 보여 줍니다. " + error));
    if (!busy && !error && q && !shown.length) list.append(message("일치하는 항목이 없습니다."));
  }

  async function refresh() {
    busy = true;
    error = null;
    draw();
    try {
      items = await load(source, (partial) => {
        if (!ctx.alive()) return;
        if (!items.length) items = partial;
        draw();
      });
      loaded.set(source.id, items);
    } catch (e) {
      error = errorText(e);
    }
    busy = false;
    if (ctx.alive()) draw();
  }

  draw();
  if (!loaded.has(source.id)) refresh();
}
