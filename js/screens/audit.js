// 회계감리 조치현황: 금감원 「회계감리결과제재」 공시를 정리한 목록과 상세(앱 AuditScreen.kt와 같은 필터).
// 주소: ?q=검색어&m=시장&f=조치 · ?id=공시번호
import { setHeader } from "../app.js";
import { errorText, h, icon, loading, message } from "../core.js";
import { caseButtons, dartQuery, loadData, matchAll, terms } from "../lib/accdata.js";
import { Format } from "../lib/yangjeong.js";

const MARKETS = ["전체", "코스닥", "유가증권", "코넥스", "비상장"];
const FILTERS = ["전체", "과징금", "고발·통보", "감사인지정"];
const DISCLAIMER = "금감원 공시를 자동으로 정리한 참고용 자료입니다. 판단의 근거로는 원문을 확인하세요.";
const keyOf = (a) => a.slno || `${a.company}|${a.actionDate}`;

export async function render(root, params, ctx) {
  setHeader("회계감리 조치현황", "금융감독원 회계감리결과제재 공시");
  root.append(loading());
  let data;
  try {
    data = await loadData("audit_actions");
  } catch (e) {
    if (ctx.alive()) root.replaceChildren(message("자료를 불러오지 못했습니다. " + errorText(e), { error: true }));
    return;
  }
  if (!ctx.alive()) return;
  const seen = new Set();
  const items = data.items.filter((a) => !seen.has(keyOf(a)) && seen.add(keyOf(a))).sort((a, b) => (b.actionDate || "").localeCompare(a.actionDate || ""));
  root.replaceChildren();
  if (params.id) {
    const a = items.find((x) => keyOf(x) === params.id);
    return a ? detail(root, a) : root.append(message("해당 조치를 찾지 못했습니다.", { action: "목록으로", onAction: () => ctx.go({}) }));
  }
  setHeader("회계감리 조치현황", `금감원 공시 · 총 ${items.length}건 · 자료 기준 ${String(data.generatedAt || "").slice(0, 10)}`);
  const q = params.q || "";
  const m = MARKETS.includes(params.m) ? params.m : "전체";
  const f = FILTERS.includes(params.f) ? params.f : "전체";
  const input = h("input", { type: "search", value: q, placeholder: "회사명·지적내용·계정·위반유형", enterkeyhint: "search" });
  const go = (p) => ctx.go({ q: input.value.trim() || null, m: m === "전체" ? null : m, f: f === "전체" ? null : f, ...p }, { replace: true });
  const listBox = h("div");
  const draw = () => {
    const ts = terms(input.value);
    const list = items.filter((a) => match(a, m, f, ts));
    listBox.replaceChildren(
      h("div", { class: "note", style: { margin: "4px 0 8px" } }, `${list.length}건`),
      h("section", { class: "card" }, list.length ? h("div", { class: "list" }, list.map((a) => row(a, () => ctx.go({ id: keyOf(a) })))) : h("p", { class: "note" }, "조건에 맞는 조치가 없습니다."))
    );
  };
  let timer;
  input.addEventListener("input", () => (clearTimeout(timer), (timer = setTimeout(draw, 150))));
  root.append(
    h("form", { class: "search", onsubmit: (e) => (e.preventDefault(), go({})) }, icon("search"), input, h("button", { class: "btn sm", type: "submit" }, "검색")),
    h("div", { class: "chip-row", style: { marginBottom: "6px" } }, MARKETS.map((x) => h("button", { type: "button", class: "pill" + (x === m ? " on" : ""), onclick: () => go({ m: x === "전체" ? null : x }) }, x))),
    h("div", { class: "chip-row" }, FILTERS.map((x) => h("button", { type: "button", class: "pill" + (x === f ? " on" : ""), onclick: () => go({ f: x === "전체" ? null : x }) }, x))),
    listBox,
    h("p", { class: "note", style: { marginTop: "10px" } }, "출처: 금융감독원 회계감리결과제재 공시 / 직접 수집. " + DISCLAIMER)
  );
  draw();
}

function match(a, market, filter, ts) {
  if (market !== "전체" && !(a.market || "").includes(market)) return false;
  const fl = a.flags || {};
  if (filter === "과징금" && !fl.fine) return false;
  if (filter === "고발·통보" && !(fl.prosecution || fl.referral)) return false;
  if (filter === "감사인지정" && fl.auditorDesignationYears == null) return false;
  if (!ts.length) return true;
  return matchAll([a.company, a.industry, ...(a.accounts || []), ...(a.violationTypes || []), ...(a.findings || []).map((x) => x.title)].join(" "), ts);
}

function tags(a) {
  const f = a.flags || {};
  return [
    f.fine ? h("span", { class: "tag red" }, f.fineFinal && f.fineWon != null ? `과징금 ${Format.won(f.fineWon)}` : "과징금(금융위 결정 예정)") : null,
    f.auditorDesignationYears != null ? h("span", { class: "tag orange" }, `감사인지정 ${f.auditorDesignationYears}년`) : null,
    f.prosecution ? h("span", { class: "tag blue" }, "고발") : f.referral ? h("span", { class: "tag blue" }, "통보") : null,
  ];
}

function row(a, open) {
  const fs = a.findings || [];
  const first = fs[0]?.title;
  return h("div", { class: "item" }, h("div", { class: "body static case-row" }, h("div", { class: "case-info" },
    h("div", { class: "m", style: { marginTop: 0, marginBottom: "3px" } }, tags(a)),
    h("div", { class: "t" }, a.company),
    h("div", { class: "m" }, `${Format.dateYmd(a.actionDate)} · ${a.market || "-"} · 감리대상 ${a.auditPeriod || "-"}`),
    h("div", { class: "m" }, first ? (fs.length > 1 ? `${first} 외 ${fs.length - 1}건` : first) : "지적사항 자동 추출 실패 · 원문 확인"),),
    caseButtons(a.company, open)));
}

function detail(root, a) {
  setHeader(a.company, `${Format.dateYmd(a.actionDate)} 조치 · ${a.market || ""}` + (a.decision?.round ? ` · 제${a.decision.round}차 증선위` : ""));
  const fl = a.flags || {};
  const dart = dartQuery(a.company);
  root.append(h("div", { class: "grid2" },
    h("div", { class: "col" },
      dart ? h("a", { class: "btn", href: "#/dart?q=" + encodeURIComponent(dart) }, icon("building"), `기업 개황 및 공시(DART)에서 ${a.company} 찾기`) : null,
      h("section", { class: "card" }, h("div", { class: "ch" }, icon("building"), h("h3", null, "기본 정보")),
        h("dl", { class: "kv" },
          h("dt", null, "감리대상 사업연도"), h("dd", null, a.auditPeriod || "-"),
          a.industry ? [h("dt", null, "업종"), h("dd", null, a.industry)] : null,
          a.fiscalYearEnds ? [h("dt", null, "결산기"), h("dd", null, a.fiscalYearEnds)] : null),
        h("div", { class: "row-gap", style: { marginTop: "10px" } }, tags(a))),
      h("section", { class: "card" }, h("div", { class: "ch" }, icon("gavel"), h("h3", null, "조치 내용")),
        (a.actions || []).length ? h("ul", { style: { margin: 0, paddingLeft: "18px" } }, a.actions.map((x) => h("li", null, x))) : h("p", { class: "note" }, "조치 내용을 자동 추출하지 못했습니다. 원문을 확인하세요."),
        fl.fineNote ? h("p", { class: "note", style: { marginTop: "8px" } }, "※ " + fl.fineNote) : null),
      h("section", { class: "card" }, h("div", { class: "ch" }, icon("external-link"), h("h3", null, "원문")),
        h("div", { class: "stack" },
          h("a", { class: "btn", href: a.viewUrl, target: "_blank", rel: "noopener" }, "금감원 공시 페이지 열기"),
          (a.files || []).map((x) => h("a", { class: "btn ghost", href: x.url, target: "_blank", rel: "noopener", style: { whiteSpace: "normal" } }, "첨부 원문: " + x.name)),
          h("p", { class: "note" }, "출처: 금융감독원 회계감리결과제재 공시 / 직접 수집")))),
    h("div", { class: "col" },
      h("section", { class: "card" }, h("div", { class: "ch" }, icon("list"), h("h3", null, `지적사항 ${(a.findings || []).length}건`)),
        h("div", { class: "list" }, (a.findings || []).map((x) => h("div", { class: "item" }, h("div", { style: { flex: 1 } },
          h("div", { class: "t" }, `${x.no}. ${x.title}`),
          x.amountNote ? h("div", { class: "m" }, x.amountNote) : null,
          x.summary ? h("p", { style: { margin: "6px 0 0" } }, x.summary) : null,
          h("div", { class: "m" }, (x.accounts || []).map((t) => h("span", { class: "tag blue" }, t)), (x.violations || []).map((t) => h("span", { class: "tag" }, t)))))))),
      h("p", { class: "note" }, DISCLAIMER))));
}
