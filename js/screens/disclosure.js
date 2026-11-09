// 공시조사결과제재: 금감원 '공시위반 조치 내역'(증권선물위원회·금융위원회) 가운데 2020년 이후 글을 첨부 세부내역까지 읽어 회사별로 보여 준다.
// 앱의 DisclosureScreen.kt와 같은 필터. 주소: ?q=검색어&y=연도&f=조치 · ?id=건 번호
// 항목마다 「기업개황 등」(DART 검색)·「세부내용」 버튼을 두고, 위반 조문을 누르면 스마트 법령검색이 열린다.
import { setHeader } from "../app.js";
import { errorText, h, icon, loading, message } from "../core.js";
import { caseButtons, dartQuery, loadData, matchAll, terms } from "../lib/accdata.js";
import { Format } from "../lib/yangjeong.js";

const FILTERS = ["전체", "과징금", "증권발행제한", "경고·주의", "고발·통보"];
const DISCLAIMER = "금감원 공시 첨부를 자동으로 읽어 회사별로 정리한 참고용 자료입니다. 판단의 근거로는 원문을 확인하세요.";
const yearOf = (c) => String(c.date || c.postDate || "").slice(0, 4);
const ymd = (d) => (d ? Format.dateYmd(String(d).replace(/-/g, "")) : "");

export async function render(root, params, ctx) {
  setHeader("공시조사결과제재", "금융감독원 공시위반 조치 내역 · 2020년 이후 · 회사별");
  root.append(loading());
  let data;
  try {
    data = await loadData("disclosure_sanctions");
  } catch (e) {
    if (ctx.alive()) root.replaceChildren(message("자료를 불러오지 못했습니다. " + errorText(e), { error: true }));
    return;
  }
  if (!ctx.alive()) return;
  const seen = new Set();
  const items = data.items.filter((c) => c.id && !seen.has(c.id) && seen.add(c.id)).sort((a, b) => (b.date || b.postDate || "").localeCompare(a.date || a.postDate || "") || b.id.localeCompare(a.id));
  root.replaceChildren();
  if (params.id) {
    const c = items.find((x) => x.id === params.id);
    return c ? detail(root, c) : root.append(message("해당 조치를 찾지 못했습니다.", { action: "목록으로", onAction: () => ctx.go({}) }));
  }
  setHeader("공시조사결과제재", `증권선물위원회·금융위원회 공시위반 조치 · 2020년 이후 · 회사별 ${items.length}건 · 자료 기준 ${String(data.generatedAt || "").slice(0, 10)}`);
  const years = ["전체", ...[...new Set(items.map(yearOf).filter(Boolean))].sort().reverse()];
  const q = params.q || "";
  const y = years.includes(params.y) ? params.y : "전체";
  const f = FILTERS.includes(params.f) ? params.f : "전체";
  const input = h("input", { type: "search", value: q, placeholder: "회사명·위반내용·조치·조문", enterkeyhint: "search", "aria-label": "검색어" });
  const go = (p) => ctx.go({ q: input.value.trim() || null, y: y === "전체" ? null : y, f: f === "전체" ? null : f, ...p }, { replace: true });
  const listBox = h("div");
  const draw = () => {
    const ts = terms(input.value);
    const list = items.filter((c) => match(c, y, f, ts));
    listBox.replaceChildren(
      h("div", { class: "note", style: { margin: "4px 0 8px" } }, `${list.length}건`),
      h("section", { class: "card" }, list.length ? h("div", { class: "list" }, list.map((c) => row(c, () => ctx.go({ id: c.id })))) : h("p", { class: "note" }, "조건에 맞는 조치가 없습니다."))
    );
  };
  let timer;
  input.addEventListener("input", () => (clearTimeout(timer), (timer = setTimeout(draw, 150))));
  root.append(
    h("form", { class: "search", onsubmit: (e) => (e.preventDefault(), go({})) }, icon("search"), input, h("button", { class: "btn sm", type: "submit" }, "검색")),
    h("div", { class: "chip-row", style: { marginBottom: "6px" } }, years.map((x) => h("button", { type: "button", class: "pill" + (x === y ? " on" : ""), onclick: () => go({ y: x === "전체" ? null : x }) }, x))),
    h("div", { class: "chip-row" }, FILTERS.map((x) => h("button", { type: "button", class: "pill" + (x === f ? " on" : ""), onclick: () => go({ f: x === "전체" ? null : x }) }, x))),
    h("p", { class: "note", style: { margin: "8px 0 0" } }, "「기업개황 등」은 「기업 개황 및 공시(DART)」에서 그 회사를 찾고, 「세부내용」은 조치 상세를 엽니다. 한 첨부에 여러 회사가 있어도 회사별로 나누어 보여 줍니다."),
    listBox,
    h("p", { class: "note", style: { marginTop: "10px" } }, "출처: 금융감독원 공시조사결과제재(공시위반 조치 내역) / 직접 수집. " + DISCLAIMER)
  );
  draw();
}

function match(c, year, filter, ts) {
  if (year !== "전체" && yearOf(c) !== year) return false;
  const kinds = c.kinds || [];
  if (filter === "과징금" && !(c.fineWon != null || kinds.includes("과징금"))) return false;
  if (filter === "증권발행제한" && !(c.issueLimitMonths != null || kinds.includes("증권발행제한"))) return false;
  if (filter === "경고·주의" && !kinds.some((k) => k === "경고" || k === "주의")) return false;
  if (filter === "고발·통보" && !kinds.some((k) => k.includes("고발") || k.includes("통보"))) return false;
  if (!ts.length) return true;
  return matchAll([c.company, c.role, ...(c.actions || []), ...(c.laws || []), ...(c.violations || []).map((v) => v.title)].join(" "), ts);
}

function tags(c) {
  const kinds = (c.kinds || []).filter((k) => !["과징금", "증권발행제한", "과태료"].includes(k));
  const out = [];
  if (c.fineWon != null) out.push(h("span", { class: "tag red" }, `과징금 ${Format.won(c.fineWon)}`));
  if (c.issueLimitMonths != null) out.push(h("span", { class: "tag orange" }, `증권발행제한 ${c.issueLimitMonths}월`));
  kinds.forEach((k) => out.push(h("span", { class: "tag blue" }, k)));
  if (!out.length && (c.actions || [])[0]) out.push(h("span", { class: "tag blue" }, c.actions[0]));
  return out;
}

function row(c, open) {
  const vs = (c.violations || []).filter((v) => v.title);
  const first = vs[0]?.title;
  return h("div", { class: "item" }, h("div", { class: "body static" },
    h("div", { class: "m", style: { marginTop: 0, marginBottom: "3px" } }, tags(c)),
    h("div", { class: "t" }, c.company),
    h("div", { class: "m" }, [c.date ? ymd(c.date) : "", c.role, c.committee].filter(Boolean).join(" · ")),
    first ? h("div", { class: "m" }, vs.length > 1 ? `${first} 외 ${vs.length - 1}건` : first) : null,
    caseButtons(c.company, open)));
}

function detail(root, c) {
  setHeader(c.company, [c.date ? `${ymd(c.date)} 조치` : "", c.role].filter(Boolean).join(" · "));
  const dart = dartQuery(c.company);
  root.append(h("div", { class: "grid2" },
    h("div", { class: "col" },
      dart ? h("a", { class: "btn", href: "#/dart?q=" + encodeURIComponent(dart) }, icon("building"), `기업 개황 및 공시(DART)에서 ${c.company} 찾기`) : null,
      h("section", { class: "card" }, h("div", { class: "ch" }, icon("building"), h("h3", null, "기본 정보")),
        h("dl", { class: "kv" },
          c.round ? [h("dt", null, "공시"), h("dd", null, c.round)] : null,
          h("dt", null, "게시일"), h("dd", null, c.postDate || "-"),
          c.committee ? [h("dt", null, "의결"), h("dd", null, c.committee)] : null,
          c.role ? [h("dt", null, "역할"), h("dd", null, c.role)] : null),
        h("div", { class: "row-gap", style: { marginTop: "10px" } }, tags(c)),
        c.coCount > 1 ? h("p", { class: "note", style: { marginTop: "8px" } }, `같은 첨부에 ${c.coCount}개 회사가 함께 공시되었고, 이 화면은 이 회사 몫만 나누어 보여 줍니다.`) : null,
        c.masked ? h("p", { class: "note", style: { marginTop: "8px" } }, "금감원이 공시에서 이름을 가려(○○○) 공개한 대상입니다.") : null),
      h("section", { class: "card" }, h("div", { class: "ch" }, icon("gavel"), h("h3", null, "조치 내용")),
        (c.actions || []).length ? h("ul", { class: "sim-ul" }, c.actions.map((x) => h("li", null, x))) : h("p", { class: "note" }, "조치 내용을 자동 추출하지 못했습니다. 원문을 확인하세요.")),
      h("section", { class: "card" }, h("div", { class: "ch" }, icon("external-link"), h("h3", null, "원문")),
        h("div", { class: "stack" },
          c.postUrl ? h("a", { class: "btn", href: c.postUrl, target: "_blank", rel: "noopener" }, "금감원 게시글 열기") : null,
          c.fileUrl ? h("a", { class: "btn ghost", href: c.fileUrl, target: "_blank", rel: "noopener", style: { whiteSpace: "normal" } }, "첨부 원문: " + (c.fileName || "")) : null,
          h("p", { class: "note" }, "출처: 금융감독원 공시조사결과제재(공시위반 조치 내역) / 직접 수집"))),),
    h("div", { class: "col" },
      h("section", { class: "card" }, h("div", { class: "ch" }, icon("list"), h("h3", null, `위반행위 ${(c.violations || []).length}건`)),
        h("div", { class: "list" }, (c.violations || []).map((v, i) => h("div", { class: "item" }, h("div", { style: { flex: 1 } },
          h("div", { class: "t" }, `${i + 1}. ${v.title || "위반 내용"}`),
          (v.facts || []).map((x) => h("p", { style: { margin: "6px 0 0" } }, x))))))),
      (c.laws || []).length ? h("section", { class: "card" }, h("div", { class: "ch" }, icon("scale"), h("h3", null, "관련 법규")),
        (c.laws || []).map((x) => h("p", { class: "note", style: { margin: "0 0 4px" } }, x)),
        (c.lawRefs || []).length ? [h("div", { class: "note", style: { margin: "8px 0 4px" } }, "스마트 법령검색으로 조문 열기"),
          h("div", { class: "lw-chips" }, c.lawRefs.map((r) => h("a", { class: "pill sm", href: "#/law?q=" + encodeURIComponent(r) }, r.replace("자본시장과 금융투자업에 관한 법률", "자본시장법"))))] : null) : null,
      h("p", { class: "note" }, DISCLAIMER))));
}
