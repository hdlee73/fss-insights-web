// 기준서/질의회신/지적사례 검색: 앱 SearchScreen.kt와 같은 탭·검색 규칙. 주소: ?tab=0..3&q=검색어&g=기준서묶음
import { setHeader } from "../app.js";
import { errorText, h, icon, loading, message, tabs } from "../core.js";
import { loadData, matchAll, standardSource, terms } from "../lib/accdata.js";

const KINDS = ["통합", "기준서", "질의회신", "해석", "감리지적사례"];
const KEYS = [null, null, "qna", "interp", "audit-case"];
const GROUP_ORDER = ["K-IFRS", "일반기업회계기준", "기타 기준서", "회계감사기준", "내부회계관리제도"];
const groupRank = (g) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? GROUP_ORDER.length : i; };
const PER_KIND = 20;
const MAX = 100;
const DISCLAIMER = "이 정보는 참고용이며 공식 해석이 아닙니다. 판단의 근거로는 원문을 확인하세요.";

export async function render(root, params, ctx) {
  setHeader("회계기준서·질의회신·지적사례", "회계기준서 · 질의회신 · 기준해석 · 감리지적사례 제목 색인");
  const tab = Math.min(Math.max(+params.tab || 0, 0), 4);
  const q = params.q || "";
  const group = params.g || "";
  const input = h("input", { type: "search", value: q, enterkeyhint: "search", placeholder: tab === 0 ? "기준서·질의회신·해석·감리지적사례 통합 검색 (예: 리스, 수익인식)" : tab === 1 ? "기준서 번호·제목 (예: 1116, 리스)" : "제목 키워드 (예: 리스, 특수관계자 주석)", "aria-label": "검색어" });
  root.append(
    tabs(KINDS, tab, (i) => ctx.go({ tab: i || null, q: q || null })),
    h("form", { class: "search", onsubmit: (e) => (e.preventDefault(), input.blur(), ctx.go({ tab: tab || null, q: input.value.trim() || null, g: tab === 1 && group || null }, { replace: true })) },
      icon("search"), input, h("button", { class: "btn sm", type: "submit" }, "검색"))
  );
  const box = h("div", null, loading());
  root.append(box);
  let data;
  try {
    data = tab === 0 ? { std: await loadData("standards"), brd: await loadData("board_index") } : await loadData(tab === 1 ? "standards" : "board_index");
  } catch (e) {
    if (ctx.alive()) box.replaceChildren(message("자료를 불러오지 못했습니다. " + errorText(e), { error: true, action: "다시 시도", onAction: () => location.reload() }));
    return;
  }
  if (!ctx.alive()) return;
  const ts = terms(q);
  // 입력하는 대로 걸러 보여 준다(주소는 검색 단추를 누를 때만 바꾼다).
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => draw(terms(input.value)), 150);
  });
  const draw = tab === 0 ? (t) => box.replaceChildren(combined(data, t))
    : tab === 1 ? (t) => box.replaceChildren(standards(data, t, group, ctx, input))
    : (t) => box.replaceChildren(board(data, t, KEYS[tab]));
  draw(ts);
}

function standards(data, ts, group, ctx, input) {
  const groups = [...new Set(data.items.map((s) => s.group))].sort((a, b) => groupRank(a) - groupRank(b));
  const list = data.items.filter((s) => (!group || s.group === group) && matchAll(`${s.group} ${s.label} ${s.no} ${s.title}`, ts))
    .map((s, i) => [s, i]).sort((a, b) => groupRank(a[0].group) - groupRank(b[0].group) || a[1] - b[1]).map((x) => x[0]);
  return h("div", { class: "stack" },
    h("div", { class: "chip-row" }, ["전체", ...groups].map((g) => h("button", { type: "button", class: "pill" + ((g === "전체" ? !group : g === group) ? " on" : ""), onclick: () => ctx.go({ tab: 1, q: input.value.trim() || null, g: g === "전체" ? null : g }, { replace: true }) }, g))),
    h("div", { class: "note" }, `기준서 ${list.length}건`),
    h("section", { class: "card" }, list.length ? h("div", { class: "list" }, list.map((s) =>
      h("div", { class: "item" }, h("a", { class: "body", href: s.url, target: "_blank", rel: "noopener", style: { color: "inherit", textDecoration: "none" } },
        h("div", { class: "t" }, s.label && !s.title.startsWith(s.label) ? `${s.label} ${s.title}` : s.title),
        h("div", { class: "m" }, h("span", { class: "tag blue" }, s.group), `출처: ${standardSource(s.group)}`))))) : h("p", { class: "note" }, "조건에 맞는 기준서가 없습니다.")),
    h("div", null, h("a", { class: "btn ghost", href: "https://db.kasb.or.kr/standard", target: "_blank", rel: "noopener" }, icon("external-link"), "한국회계기준원 기준서 DB에서 전문 보기")),
    h("p", { class: "note" }, "기준서 목록은 한국회계기준원 등 제정기관의 기준서를 회계위키(accountingwiki.co.kr)를 통해 정리한 것이며, 항목을 누르면 회계위키의 해당 기준서 페이지가 열립니다. 기타 기준서(중소기업·비영리조직·특수분야·지속가능성 공시기준 등)는 한국회계기준원 누리집의 해당 목록으로 연결됩니다. 원문 저작권은 각 제정기관에 있습니다. " + DISCLAIMER)
  );
}

function board(data, ts, kind) {
  const list = data.items.filter((b) => b.kind === kind && b.url && (!ts.length || matchAll(b.title + " " + (b.meta || []).join(" "), ts)))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return h("div", { class: "stack" },
    h("div", { class: "note" }, `검색 결과 ${list.length.toLocaleString("ko-KR")}건` + (list.length > MAX ? ` (상위 ${MAX}건 표시, 키워드를 더 입력해 좁혀 보세요)` : "") + ` · 자료 기준 ${String(data.generatedAt || "").slice(0, 10)} (${data.from})`),
    h("section", { class: "card" }, list.length ? h("div", { class: "list" }, list.slice(0, MAX).map((b) =>
      h("div", { class: "item" }, h("a", { class: "body", href: b.url, target: "_blank", rel: "noopener", style: { color: "inherit", textDecoration: "none" } },
        h("div", { class: "t" }, b.title),
        h("div", { class: "m" }, h("span", { class: "tag blue" }, b.kindLabel || ""), [b.date, ...(b.meta || [])].filter(Boolean).join(" · ")),
        b.source ? h("div", { class: "m" }, "출처: " + b.source) : null)))) : h("p", { class: "note" }, "조건에 맞는 자료가 없습니다.")),
    h("p", { class: "note" }, "제목·분류만 색인합니다. 항목에 표시한 출처(원본 기관 / 수집 경로)와 원문 링크에서 본문을 확인하세요. " + DISCLAIMER)
  );
}

// 통합 검색: 기준서·질의회신·해석·감리지적사례를 한 번에 찾아 종류별로 묶어 보여 준다.
function combined(data, ts) {
  if (!ts.length) return h("div", { class: "stack" }, h("p", { class: "note" }, "검색어를 입력하면 기준서·질의회신·해석·감리지적사례를 한 번에 찾습니다."));
  const std = data.std.items.filter((s) => matchAll(`${s.group} ${s.label} ${s.no} ${s.title}`, ts))
    .map((s, i) => [s, i]).sort((a, b) => groupRank(a[0].group) - groupRank(b[0].group) || a[1] - b[1]).map((x) => x[0]);
  const sections = [h("section", { class: "card" },
    h("div", { class: "note" }, `기준서 ${std.length}건` + (std.length > PER_KIND ? ` (상위 ${PER_KIND}건 표시)` : "")),
    std.length ? h("div", { class: "list" }, std.slice(0, PER_KIND).map((s) =>
      h("div", { class: "item" }, h("a", { class: "body", href: s.url, target: "_blank", rel: "noopener", style: { color: "inherit", textDecoration: "none" } },
        h("div", { class: "t" }, s.label && !s.title.startsWith(s.label) ? `${s.label} ${s.title}` : s.title),
        h("div", { class: "m" }, h("span", { class: "tag blue" }, "기준서 · " + s.group), `출처: ${standardSource(s.group)}`))))) : null)];
  for (const [label, key] of [["질의회신", "qna"], ["해석", "interp"], ["감리지적사례", "audit-case"]]) {
    const list = data.brd.items.filter((b) => b.kind === key && b.url && matchAll(b.title + " " + (b.meta || []).join(" "), ts))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    sections.push(h("section", { class: "card" },
      h("div", { class: "note" }, `${label} ${list.length.toLocaleString("ko-KR")}건` + (list.length > PER_KIND ? ` (상위 ${PER_KIND}건 표시, 해당 탭에서 전체 보기)` : "")),
      list.length ? h("div", { class: "list" }, list.slice(0, PER_KIND).map((b) =>
        h("div", { class: "item" }, h("a", { class: "body", href: b.url, target: "_blank", rel: "noopener", style: { color: "inherit", textDecoration: "none" } },
          h("div", { class: "t" }, b.title),
          h("div", { class: "m" }, h("span", { class: "tag blue" }, b.kindLabel || label), [b.date, ...(b.meta || [])].filter(Boolean).join(" · ")),
          b.source ? h("div", { class: "m" }, "출처: " + b.source) : null)))) : null));
  }
  return h("div", { class: "stack" }, ...sections, h("p", { class: "note" }, "제목·분류만 색인합니다. 항목의 출처와 원문 링크에서 본문을 확인하세요. " + DISCLAIMER));
}
