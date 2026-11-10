// 과징금·양정 시뮬레이터(앱 SimulatorScreen.kt와 같은 입력·계산). 계산은 lib/yangjeong.js(앱과 같은 결과를 시험으로 확인).
// 저장은 이 브라우저(localStorage)에만 하고 서버로 보내지 않는다. 파일 내보내기·가져오기는 앱과 같은 JSON 형식.
import { setHeader } from "../app.js";
import { dialog, download, errorText, fetchSite, h, icon, store, toast } from "../core.js";
import { xlsx } from "../lib/xlsx.js";
import {
  ActorKind, CompanyKind, FineModel, Format, Level, Motive, Reasons, ScaleBasis, Stock, VType, Yangjeong, actorTitle, defaultAssign, defaultMotive, newActor, sortedActors,
  decodeSims, defaultSettings, encodeSims, newRow, normalizeSettings, runSimulation,
} from "../lib/yangjeong.js";

const opts = (obj) => Object.entries(obj).map(([k, v]) => [k, v.label]);
const lastYear = () => new Date().getFullYear() - 1;
const nowText = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, "_");

// 화면을 옮겨 다녀도 입력이 남도록 모듈에 두고, 새로고침에 대비해 작성 중인 값도 이 브라우저에 보관한다.
let S = null;
let cur = { id: null, name: "" };
let stock = null;
const freshStock = () => ({ query: "", candidates: [], chosen: null, summary: null, candles: [], from: `${lastYear()}-01-01`, to: `${lastYear()}-12-31`, busy: false, msg: "" });

function boot() {
  if (S) return;
  const d = store.get("sim.draft", null);
  S = normalizeSettings(d?.settings || defaultSettings());
  cur = { id: d?.id || null, name: d?.name || "" };
  stock = { ...freshStock(), ...(d?.stock ? fromSaved(d.stock, d.company) : {}) };
}
function fromSaved(sm, company) {
  return {
    query: company || sm?.name || "",
    summary: sm || null,
    chosen: sm ? { code: sm.code, name: sm.name, market: sm.market } : null,
    from: sm?.from || `${lastYear()}-01-01`,
    to: sm?.to || `${lastYear()}-12-31`,
    candles: [],
  };
}
let draftTimer;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => store.set("sim.draft", { id: cur.id, name: cur.name, settings: S, company: stock.query, stock: stock.summary }), 400);
}
const sims = () => {
  const v = store.get("sims", []);
  return Array.isArray(v) ? v : [];
};

let refs = null; // 이 화면의 DOM 묶음

export async function render(root) {
  boot();
  setHeader("(베타) 회계 양정 및 과징금 시뮬레이터", "외감규정·시행세칙 양정기준 적용 모의계산 (참고용)");
  refs = { root, form: h("div", { class: "col" }), result: h("div", { class: "col sim-result" }), stockBox: h("div", { class: "stack" }), saveMsg: h("div", { class: "note", role: "status" }) };
  root.append(h("div", { class: "grid2 sim" }, refs.form, refs.result));
  drawForm();
  recompute();
}

export function leave() {
  refs = null;
}

// ------------------------------------------------------------------ 입력 부품

function chips(options, get, set, { rerender = false } = {}) {
  const row = h("div", { class: "chip-row wrap" });
  const paint = () => row.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === String(get())));
  for (const [v, label] of options) {
    row.append(h("button", { type: "button", class: "pill", "data-v": String(v), onclick: () => {
      set(v);
      if (rerender) drawForm();
      else paint();
      recompute();
    } }, label));
  }
  paint();
  return row;
}

function num(label, get, set, { placeholder = "" } = {}) {
  const input = h("input", { inputmode: "decimal", value: get(), placeholder, autocomplete: "off" });
  input.addEventListener("input", () => {
    const v = input.value.replace(/[^\d.,]/g, "").slice(0, 12);
    if (v !== input.value) input.value = v;
    set(v);
    recompute();
  });
  return h("label", { class: "field" }, h("span", null, label), input);
}

function toggle(label, get, set, { rerender = true } = {}) {
  const cb = h("input", { type: "checkbox" });
  cb.checked = !!get();
  cb.addEventListener("change", () => {
    set(cb.checked);
    if (rerender) drawForm();
    recompute();
  });
  return h("label", { class: "row-gap sim-toggle" }, cb, h("span", null, label));
}

const lab = (t) => h("div", { class: "section-label" }, t);
const sec = (title, ic, ...body) => h("section", { class: "card" }, h("div", { class: "ch" }, icon(ic), h("h3", null, title)), h("div", { class: "stack" }, ...body));

// ------------------------------------------------------------------ 입력 화면

function drawForm() {
  if (!refs) return;
  // replaceChildren은 null을 "null" 글자로 넣으므로 빈 항목을 걸러 낸다.
  refs.form.replaceChildren(saveCard(), companyCard(), ...rowCards(),
    h("button", { type: "button", class: "btn ghost", onclick: () => (S.rows.push(newRow(Math.max(0, ...S.rows.map((r) => r.id)) + 1, S.actors)), drawForm(), recompute()) }, icon("plus"), "위법행위 추가"),
    actorsCard(), ...sortedActors(S.actors).map(actorCard), commonCard());
}

function saveCard() {
  const name = h("input", { value: cur.name, placeholder: "예: A사 2024 매출 과대계상", maxlength: 60 });
  name.addEventListener("input", () => ((cur.name = name.value), saveDraft()));
  const file = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: () => importFile(file) });
  return h("section", { class: "card sim-save" },
    h("div", { class: "ch" }, icon("save"), h("h3", null, "시뮬레이션 저장·불러오기")),
    h("div", { class: "stack" },
      h("label", { class: "field" }, h("span", null, "시뮬레이션 이름"), name),
      h("div", { class: "row-gap" },
        h("button", { type: "button", class: "btn", onclick: save }, icon("save"), "저장"),
        h("button", { type: "button", class: "btn ghost", onclick: openSaved }, icon("folder-open"), `불러오기 (${sims().length})`),
        h("button", { type: "button", class: "btn ghost", onclick: reset }, icon("rotate-ccw"), "새로"),
        h("button", { type: "button", class: "btn ghost sm", onclick: exportFile }, icon("download"), "파일로 내보내기"),
        h("button", { type: "button", class: "btn ghost sm", onclick: () => file.click() }, icon("upload"), "파일 가져오기"), file),
      refs.saveMsg,
      h("div", { class: "infobox note" }, h("div", null, icon("lock"), " 시뮬레이션은 이 기기(이 브라우저) 안에만 저장되며 서버로 보내지 않습니다."),
        h("div", null, "브라우저의 사이트 데이터를 지우거나 다른 기기·브라우저에서 열면 보이지 않으므로, 보관하거나 옮기려면 ‘파일로 내보내기’를 이용하세요. 내보낸 파일은 안드로이드 앱에서도 가져올 수 있습니다."))));
}

function companyCard() {
  const q = h("input", { type: "search", value: stock.query, placeholder: "상장사: 주가·거래대금 조회", enterkeyhint: "search" });
  q.addEventListener("input", () => (stock.query = q.value));
  const from = h("input", { type: "date", value: stock.from, max: "2099-12-31" });
  const to = h("input", { type: "date", value: stock.to, max: "2099-12-31" });
  from.addEventListener("change", () => ((stock.from = from.value), saveDraft()));
  to.addEventListener("change", () => ((stock.to = to.value), saveDraft()));
  const half = !CompanyKind[S.kind].listed && !S.financial
    ? toggle("소규모 비상장(규모조정계수 50% 적용 가능 요건)", () => S.halfCoefficient, (v) => (S.halfCoefficient = v), { rerender: false }) : null;
  drawStock();
  return sec("1. 회사 정보", "building",
    h("form", { class: "search", style: { marginBottom: 0 }, onsubmit: (e) => (e.preventDefault(), searchStock()) }, icon("search"), q, h("button", { class: "btn sm", type: "submit" }, "조회")),
    h("div", { class: "field" }, h("span", null, "일평균거래금액 산정 기간 (기본: 직전 사업연도)"),
      h("div", { class: "row-gap sim-period" }, from, h("span", null, "~"), to,
        h("button", { type: "button", class: "btn ghost sm", onclick: () => (stock.chosen ? loadPeriod(stock.chosen) : searchStock()) }, icon("refresh-cw"), "이 기간으로 계산"))),
    refs.stockBox,
    lab("회사 유형"),
    chips(opts(CompanyKind), () => S.kind, (v) => (S.kind = v), { rerender: true }),
    toggle("금융회사", () => S.financial, (v) => (S.financial = v)),
    half,
    num("대상 회계연도 말 자산총계 (억원, 완전자본잠식이면 부채총계)", () => S.assetEok, (v) => (S.assetEok = v)),
    num("대상 회계연도 매출액 (억원)", () => S.salesEok, (v) => (S.salesEok = v)),
    num("감사인의 중요성 금액 (억원, 선택 — 없으면 표준 중요성 기준 적용)", () => S.materialityEok, (v) => (S.materialityEok = v)));
}

function drawStock() {
  const box = refs?.stockBox;
  if (!box) return;
  const sm = stock.summary;
  box.replaceChildren(...[
    stock.busy ? h("div", { class: "row-gap note" }, h("div", { class: "spin", style: { width: "16px", height: "16px" } }), "조회 중…") : null,
    stock.msg ? h("div", { class: "note", style: { color: "var(--warn-fg)" } }, stock.msg) : null,
    stock.candidates.length ? h("div", { class: "list" }, stock.candidates.map((c) => h("div", { class: "item" }, h("div", { class: "body", role: "button", tabindex: 0, onclick: () => loadPeriod(c) }, h("div", { class: "t" }, c.name), h("div", { class: "m" }, `${c.code} · ${c.market}`))))) : null,
    sm ? h("div", { class: "infobox" },
      h("b", null, `${sm.name} (${sm.code}) · ${sm.market}`),
      h("div", null, `최근 종가 ${sm.lastClose != null ? sm.lastClose.toLocaleString("ko-KR") + "원" : "-"}` + (sm.lastDate ? ` (${Stock.dash(sm.lastDate)})` : "")),
      h("div", null, `${sm.from} ~ ${sm.to} 일평균거래금액 `, h("b", null, Format.won(sm.avgTradingWon))),
      h("div", { class: "note" }, `거래일 ${sm.tradingDays}일 · 거래금액 합계 ${Format.won(sm.sumTradingWon)} (일별 종가×거래량 근사)`),
      h("div", { class: "note" }, `자본시장법 제429조제3항 과징금 상한 추정: ${Format.won(FineModel.capm429(sm.avgTradingWon, true))} (일평균거래금액 10%, 10억~20억원)`),
      h("div", { class: "row-gap" },
        stock.candles.length ? h("button", { type: "button", class: "btn sm", onclick: exportTrading }, icon("file-spreadsheet"), `산정 내역 엑셀 저장 (일별 ${stock.candles.length}일)`) : null,
        h("button", { type: "button", class: "btn ghost sm", onclick: () => {
          S.capmEok = (FineModel.capm429(sm.avgTradingWon, true) / 1e8).toFixed(2);
          drawForm();
          recompute();
        } }, "이 금액을 자본시장법 병과액으로 사용"))) : null,
  ].filter(Boolean));
}

function rowCards() {
  return S.rows.map((r, idx) => {
    const head = h("h3", null, `위반 ${idx + 1}` + (r.title.trim() ? ` · ${r.title.trim()}` : ""));
    const title = h("input", { value: r.title, maxlength: 80, placeholder: "예: 매출 과대계상, 재고자산 과대계상" });
    title.addEventListener("input", () => {
      r.title = title.value;
      head.textContent = `위반 ${idx + 1}` + (r.title.trim() ? ` · ${r.title.trim()}` : "");
      recompute();
    });
    return h("section", { class: "card" },
      h("div", { class: "ch" }, icon("alert-triangle"), head, h("div", { class: "ch-acts" }, S.rows.length > 1 ? h("button", { type: "button", class: "link-more", onclick: () => ((S.rows = S.rows.filter((x) => x.id !== r.id)), drawForm(), recompute()) }, icon("trash-2"), "삭제") : null)),
      h("div", { class: "stack" },
        h("label", { class: "field" }, h("span", null, "위반행위 제목"), title),
        lab("유형"),
        chips(Object.keys(VType).map((k) => [k, k]), () => r.type, (v) => ((r.type = v), (r.basis = VType[v].basis)), { rerender: true }),
        h("div", { class: "note" }, VType[r.type].label),
        lab("규모금액 기준 (표1)"),
        chips(opts(ScaleBasis), () => r.basis, (v) => (r.basis = v)),
        num("위반 금액 (억원)", () => r.amountEok, (v) => (r.amountEok = v)),
        h("div", { class: "section-label" }, "대상자별 위법 동기 (무관하면 해당없음)"),
        ...sortedActors(S.actors).map((a) => h("div", { class: "stack", style: { gap: "4px" } }, h("div", { class: "note" }, actorTitle(a)),
          chips([["", "해당없음"], ...opts(Motive)], () => r.assign[a.id] ?? "", (v) => (v ? (r.assign[a.id] = v) : delete r.assign[a.id]))))));
  });
}

function actorsCard() {
  const add = (kind) => {
    const id = Math.max(0, ...S.actors.map((a) => a.id)) + 1;
    const n = S.actors.filter((a) => a.kind === kind).length + 1;
    S.actors.push(newActor(id, kind, `${ActorKind[kind].label} ${n}`));
    for (const r of S.rows) r.assign[id] = defaultMotive(kind);
    drawForm();
    recompute();
  };
  return sec("3. 양정 대상자 (회사·임직원·감사인·공인회계사)", "badge-check",
    h("div", { class: "note" }, "대상자마다 가중·감경 사유와 과징금 요소를 따로 정합니다. 임직원·감사인·공인회계사는 여러 명 추가할 수 있고, 위반행위마다 누구에게 해당하는지 위에서 고릅니다."),
    h("div", { class: "row-gap" }, ["OFFICER", "AUDITOR", "CPA"].map((k) => h("button", { type: "button", class: "btn ghost sm", onclick: () => add(k) }, icon("plus"), ActorKind[k].label))));
}

const openActors = new Set();
function actorCard(a) {
  const cs = ActorKind[a.kind].companySide;
  const name = h("input", { value: a.name, maxlength: 30, placeholder: "예: 前대표이사, ○○회계법인, 담당이사 김○○" });
  name.addEventListener("input", () => ((a.name = name.value), recompute()));
  const list = cs ? [...Reasons.companyUp, ...Reasons.companyDown] : [...Reasons.auditorUp, ...Reasons.auditorDown];
  const reasons = h("div");
  const drawReasons = () => reasons.replaceChildren(openActors.has(a.id)
    ? reasonList(list, a)
    : h("button", { type: "button", class: "link-more", onclick: () => (openActors.add(a.id), drawReasons()) }, `가중·감경 사유 펼치기 (${a.reasons.length}개 선택)`));
  drawReasons();
  return h("section", { class: "card" },
    h("div", { class: "ch" }, icon(cs ? "building" : "badge-check"), h("h3", null, `${ActorKind[a.kind].label} · ${actorTitle(a)}`),
      h("div", { class: "ch-acts" }, a.kind !== "COMPANY" ? h("button", { type: "button", class: "link-more", onclick: () => {
        S.actors = S.actors.filter((x) => x.id !== a.id);
        for (const r of S.rows) delete r.assign[a.id];
        drawForm();
        recompute();
      } }, icon("trash-2"), "삭제") : null)),
    h("div", { class: "stack" },
      a.kind !== "COMPANY" ? h("label", { class: "field" }, h("span", null, "이름·직책"), name) : null,
      a.kind !== "CPA" ? [
        h("div", { class: "note" }, cs ? "위법행위 내용 중요도 (상: 자금조성·횡령·불공정거래 연계, 가공자산, 증빙 위·변조, 감사방해 / 중: 위법 인식)" : "위법행위 내용 중요도 (상: 감사인 이익 직결·위반 묵인/공모·내부회계 위반 알고도 계약 연장 / 중: 위법 인식)"),
        chips(opts(Level), () => a.content, (v) => (a.content = v)),
      ] : null,
      a.kind === "OFFICER" ? num("받은 경제적 이익 (억원, 비우면 1억원)", () => a.benefitEok, (v) => (a.benefitEok = v)) : null,
      a.kind === "AUDITOR" ? num("해당 감사로 받은 감사보수 (억원)", () => a.feeEok, (v) => (a.feeEok = v)) : null,
      a.kind !== "CPA" ? [
        lab("통념상 가중 (%)"),
        chips([0, 25, 50].map((x) => [x, x + "%"]), () => a.upFreePct, (v) => (a.upFreePct = v)),
        lab("합리적 감경·면제 (%, 100=면제)"),
        chips([0, 25, 50, 100].map((x) => [x, x + "%"]), () => a.downFreePct, (v) => (a.downFreePct = v)),
      ] : null,
      reasons));
}

function commonCard() {
  return sec("공통 과징금 요소 (별표 8)", "calculator",
    h("div", { class: "note" }, "시장에 미치는 영향 (상: 다수 투자자 중대 손해·사회적 물의 / 중: 위반 재무제표로 증권 공모발행 피해)"),
    chips(opts(Level), () => S.marketImpact, (v) => (S.marketImpact = v)),
    num("자본시장법 제429조 과징금 부과(예정)액 (억원, 선택 — 회사·감사인에게 차액만 부과/미부과 판단)", () => S.capmEok, (v) => (S.capmEok = v)),
    num("위반 사업연도 수 (3개 초과 가중 계산용, 기본 1)", () => String(S.years), (v) => (S.years = Math.min(Math.max(parseInt(v, 10) || 1, 1), 10))));
}

function reasonList(list, a) {
  const ups = new Set([...Reasons.companyUp, ...Reasons.auditorUp].map((r) => r.id));
  return h("div", { class: "sim-reasons" }, list.map((r) => {
    const auto = r.hint.includes("자동");
    const cb = h("input", { type: "checkbox", disabled: auto });
    cb.checked = a.reasons.includes(r.id);
    cb.addEventListener("change", () => {
      a.reasons = cb.checked ? [...new Set([...a.reasons, r.id])] : a.reasons.filter((x) => x !== r.id);
      recompute();
    });
    return h("label", { class: "sim-reason" }, cb, h("span", null,
      h("span", { class: "tag " + (ups.has(r.id) ? "red" : "green") }, `${ups.has(r.id) ? "▲가중" : "▽감경"} ${r.steps}단계`), " ", r.label,
      r.hint ? h("div", { class: "note" }, r.hint) : null));
  }));
}

// ------------------------------------------------------------------ 결과

function recompute() {
  saveDraft();
  if (!refs) return;
  const r = runSimulation(S);
  const out = [h("div", { class: "section-label" }, "모의계산 결과")];
  out.push(sec("위법행위 내역", "list", h("div", { class: "list" }, S.rows.map((x, i) => {
    const amt = Format.eokToWon(x.amountEok);
    const who = sortedActors(S.actors).filter((a) => x.assign[a.id]).map((a) => `${actorTitle(a)}(${Motive[x.assign[a.id]].label})`).join(", ") || "없음";
    return h("div", { class: "item" }, h("div", null, h("div", { class: "t" }, `${i + 1}. ${x.title.trim() || "(제목 없음)"}`),
      h("div", { class: "m" }, `${x.type} · ${ScaleBasis[x.basis].label} 기준 · ${amt > 0 ? Format.won(amt) : "금액 미입력"}`),
      h("div", { class: "m" }, "대상: " + who)));
  }))));
  if (r.error) out.push(h("div", { class: "card note", style: { color: "var(--danger)" } }, r.error));
  else {
    out.push(sec("중요성 기준금액", "scale", r.scaleLines.map((t) => h("div", { class: "note" }, t))));
    for (const ar of r.actors) {
      const kl = ActorKind[ar.actor.kind].label;
      const t = actorTitle(ar.actor).includes(kl) ? actorTitle(ar.actor) : `${actorTitle(ar.actor)} (${kl})`;
      if (!ar.assessment) { out.push(sec(t, "alert-triangle", h("div", { class: "note" }, ar.note))); continue; }
      out.push(assessCard(`${t} 조치 · 위반 ${ar.rowCount}건`, ar.assessment, ar.actions));
      const f = ar.fine;
      if (f) out.push(sec(f.title, "gavel",
        f.scoreLines.map((x) => h("div", { class: "note", style: { whiteSpace: "pre" } }, x)),
        f.result ? [f.result.lines.map((x) => h("div", { class: "sim-line" }, x)), h("div", { class: "sim-total" }, "예상 과징금 ", h("b", null, Format.won(f.result.afterCapm)))] : null,
        h("div", { class: "note" }, f.note)));
      else if (ar.note) out.push(h("div", { class: "note" }, `${t}: ${ar.note}`));
    }
    out.push(h("div", { class: "stack" }, r.notes.map((t) => h("div", { class: "note" }, "· " + t))));
  }
  out.push(h("p", { class: "note" },
    "출처: 외부감사 및 회계 등에 관한 규정 [별표 8] 과징금 부과기준, 같은 규정 시행세칙 [별표 1] 심사·감리결과 조치양정기준(금융위원회·금융감독원 / 국가법령정보센터), 주가·거래대금은 네이버 증권. " +
    "※ 위 두 별표를 단순화해 적용한 비공식 모의계산입니다. 가중·감경은 선택한 사유의 상한(최대치)을 가정하고, 사유가 겹치면 합산하되 100%를 넘지 않게 처리합니다. " +
    "별표 8이 인용하는 '별표 7' 사유 번호는 현행 시행세칙 번호와 달라 내용 기준으로 연결했습니다. 자본시장법 과징금은 별도 기준(자본시장조사 업무규정)이라 직접 입력한 금액만 반영합니다. " +
    "실제 판단은 감리위원회·증권선물위원회·금융위원회가 하며 이 결과와 다를 수 있습니다."));
  refs.result.replaceChildren(...out);
}

function assessCard(title, a, actions) {
  return sec(title, "gavel",
    Object.entries(a.multiples).map(([m, x]) => h("div", { class: "note" }, `${Motive[m].label}: 규모배수 ${x.toFixed(2)}배 → ` + (a.perMotive[m] != null ? `중요도 ${Yangjeong.gradeLabel(a.perMotive[m])}` : "1배 미만(양정 대상 아님)"))),
    Object.entries(a.converted).map(([m, x]) => h("div", { class: "note" }, `환산(<표2>) ${Motive[m].label} 기준 ${x.toFixed(2)}배`)),
    a.base ? h("div", null, "기본조치 수준: " + Yangjeong.stepLabel(a.base)) : null,
    a.netSteps ? h("div", null, `가중·감경 ${a.netSteps > 0 ? "+" : ""}${a.netSteps}단계`) : null,
    a.final ? h("div", { class: "sim-total" }, "최종 조치 수준: ", h("b", null, Yangjeong.stepLabel(a.final))) : null,
    actions.length ? h("ul", { class: "sim-ul" }, actions.map((x) => h("li", null, x))) : null,
    a.notes.map((t) => h("div", { class: "note" }, t)));
}

// ------------------------------------------------------------------ 주가·일평균거래금액(네이버 증권, 서버 /fetch 경유)

let stockSeq = 0;
async function searchStock() {
  const q = stock.query.trim();
  if (!q) return ((stock.msg = "회사명을 입력하세요."), drawStock());
  const seq = ++stockSeq;
  Object.assign(stock, { busy: true, msg: "", candidates: [], summary: null, candles: [], chosen: null });
  drawStock();
  try {
    const { text } = await fetchSite("https://ac.stock.naver.com/ac?target=stock&q=" + encodeURIComponent(q));
    if (seq !== stockSeq) return;
    const items = (JSON.parse(text).items || [])
      .map((o) => ({ code: o.code, name: o.name, market: Stock.market(o.typeName || "") }))
      .filter((c) => c.code && Stock.kindFor(c.market))
      .slice(0, 8);
    if (!items.length) Object.assign(stock, { busy: false, msg: "상장 종목을 찾지 못했습니다. 비상장이면 아래 값을 직접 입력하세요." });
    else if (items.length === 1) return loadPeriod(items[0]);
    else Object.assign(stock, { busy: false, candidates: items });
  } catch (e) {
    if (seq !== stockSeq) return;
    Object.assign(stock, { busy: false, msg: "주가를 가져오지 못했습니다. 네트워크를 확인하세요. (" + errorText(e) + ")" });
  }
  drawStock();
}

const sise = (code, from, to) => fetchSite(`https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${from}&endTime=${to}&timeframe=day`).then((r) => Stock.candles(r.text));

async function loadPeriod(c) {
  const seq = ++stockSeq;
  const from = Stock.ymd(stock.from);
  const to = Stock.ymd(stock.to);
  Object.assign(stock, { chosen: c, candidates: [], query: c.name });
  const fail = (msg) => (Object.assign(stock, { busy: false, msg }), drawStock());
  if (!from || !to) return fail("산정 기간을 날짜로 입력하세요 (예: 2025-01-01).");
  if (from > to) return fail("시작일이 종료일보다 늦습니다.");
  if (+to.slice(0, 4) - +from.slice(0, 4) > 5) return fail("산정 기간은 5년 이내로 입력하세요.");
  Object.assign(stock, { busy: true, msg: "" });
  drawStock();
  try {
    const t = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const ymd = (d) => `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const [days, recent] = await Promise.all([sise(c.code, from, to), sise(c.code, ymd(new Date(t.getTime() - 14 * 864e5)), ymd(t)).catch(() => [])]);
    if (seq !== stockSeq) return;
    const traded = Stock.tradingDays(days);
    const last = recent.at(-1);
    stock.summary = {
      code: c.code, name: c.name, market: c.market, lastClose: last?.close ?? null, lastDate: last?.date ?? null,
      avgTradingWon: Stock.avgTradingWon(days), tradingDays: traded.length, from: Stock.dash(from), to: Stock.dash(to),
      sumTradingWon: traded.reduce((a, x) => a + x.close * x.volume, 0),
    };
    stock.candles = days;
    stock.busy = false;
    stock.msg = stock.summary.avgTradingWon == null ? `${stock.summary.from} ~ ${stock.summary.to} 기간의 거래 자료가 없습니다(상장 전·거래정지 등).` : "";
    const k = Stock.kindFor(c.market);
    if (k && k !== S.kind) {
      S.kind = k;
      drawForm();
    } else drawStock();
    recompute();
  } catch (e) {
    if (seq !== stockSeq) return;
    fail("시세를 가져오지 못했습니다. (" + errorText(e) + ")");
  }
}

function exportTrading() {
  const s = stock.summary;
  if (!s || !stock.candles.length) return;
  const traded = Stock.tradingDays(stock.candles);
  const blob = xlsx([
    { name: "요약", header: ["항목", "값"], widths: [28, 60], rows: [
      ["종목", `${s.name} (${s.code})`], ["시장", s.market], ["산정 기간", `${s.from} ~ ${s.to}`],
      ["거래일 수(거래량 있는 날)", traded.length], ["거래금액 합계(원)", s.sumTradingWon], ["일평균거래금액(원)", s.avgTradingWon ?? 0],
      ["산식", "일평균거래금액 = Σ(일별 종가 × 거래량) ÷ 거래일 수"],
      ["자본시장법 제429조제3항 상한 참고", "일평균거래금액의 10%(최소 10억원, 최대 20억원)"],
      ["출처", "네이버 증권 일별 시세(종가×거래량 근사치, 실제 거래대금과 다를 수 있음)"],
    ] },
    { name: "일별 내역", header: ["일자", "종가(원)", "거래량(주)", "거래금액(원, 종가×거래량)", "산정 포함"], widths: [12, 12, 14, 22, 14],
      rows: stock.candles.map((c) => [Stock.dash(c.date), c.close, c.volume, c.close * c.volume, c.volume > 0 ? "포함" : "제외(거래 없음)"]) },
  ]);
  download(blob, safeName(`일평균거래금액_${s.name}_${s.from}_${s.to}.xlsx`));
}

// ------------------------------------------------------------------ 저장·불러오기(이 브라우저에만)

function say(t) {
  if (refs) refs.saveMsg.textContent = t;
  toast(t);
}
function snapshot(id, name) {
  return { id, name, savedAt: nowText(), company: stock.query.trim(), settings: JSON.parse(JSON.stringify(S)), stock: stock.summary };
}
function save() {
  const list = sims();
  const name = cur.name.trim() || `${stock.query.trim() || "시뮬레이션"} ${nowText()}`;
  // 불러온 것과 이름이 같으면 덮어쓰고, 이름을 바꾸면 새로 저장한다.
  const same = list.find((x) => x.id === cur.id && x.name === name);
  const id = same?.id || String(Date.now());
  const next = [snapshot(id, name), ...list.filter((x) => x.id !== id)];
  store.set("sims", next);
  if (store.get("sims", []).length !== next.length) return say("저장하지 못했습니다(브라우저 저장 공간이 막혀 있음). ‘파일로 내보내기’를 이용하세요.");
  cur = { id, name };
  drawForm();
  say(`‘${name}’을(를) 이 기기에 저장했습니다.`);
}
function openSim(sim) {
  S = normalizeSettings(sim.settings);
  cur = { id: sim.id, name: sim.name };
  stockSeq++;
  stock = { ...freshStock(), ...fromSaved(sim.stock, sim.company) };
  if (sim.stock) stock.msg = "저장 당시 산정값입니다. 일별 내역 엑셀이 필요하면 ‘이 기간으로 계산’을 누르세요.";
  drawForm();
  recompute();
  say(`‘${sim.name}’을(를) 불러왔습니다.`);
}
async function reset() {
  if (!(await dialog({ title: "새 시뮬레이션", text: "지금 입력한 값을 모두 비웁니다. 저장한 시뮬레이션은 그대로 남습니다.", ok: "비우기" }))) return;
  S = defaultSettings();
  cur = { id: null, name: "" };
  stockSeq++;
  stock = freshStock();
  drawForm();
  recompute();
}

function openSaved() {
  const back = h("div", { class: "modal-back", onclick: (e) => e.target === back && back.remove() });
  const draw = () => {
    const list = sims();
    back.replaceChildren(h("div", { class: "modal wide" },
      h("h3", null, "저장된 시뮬레이션"),
      h("p", { class: "note" }, "이 기기(이 브라우저)에 저장된 목록입니다."),
      list.length ? h("div", { class: "list modal-body" }, list.map((s) => h("div", { class: "item" },
        h("div", { class: "body", role: "button", tabindex: 0, onclick: () => (back.remove(), openSim(decodeSims(encodeSims([s]))[0])), onkeydown: (e) => e.key === "Enter" && (back.remove(), openSim(decodeSims(encodeSims([s]))[0])) },
          h("div", { class: "t" }, s.name), h("div", { class: "m" }, [s.company, `위반 ${s.settings?.rows?.length || 0}건`, s.savedAt].filter(Boolean).join(" · "))),
        h("div", { class: "acts" }, h("button", { type: "button", class: "ib", title: "삭제", "aria-label": `${s.name} 삭제`, onclick: async () => {
          if (!(await dialog({ title: "삭제할까요?", text: `‘${s.name}’을(를) 이 기기에서 삭제합니다. 되돌릴 수 없습니다.`, ok: "삭제", danger: true }))) return;
          store.set("sims", sims().filter((x) => x.id !== s.id));
          if (cur.id === s.id) cur.id = null;
          draw();
          drawForm();
        } }, icon("trash-2")))))) : h("p", null, "이 기기에 저장된 시뮬레이션이 없습니다."),
      h("div", { class: "modal-acts" }, h("button", { type: "button", class: "btn", onclick: () => back.remove() }, "닫기"))));
  };
  draw();
  back.addEventListener("keydown", (e) => e.key === "Escape" && back.remove());
  document.body.append(back);
  back.querySelector(".btn")?.focus();
}

function exportFile() {
  const name = cur.name.trim() || "양정시뮬레이션";
  const blob = new Blob([encodeSims([snapshot(cur.id || String(Date.now()), name)])], { type: "application/json" });
  download(blob, safeName(name) + ".json");
  say("파일로 내보냈습니다.");
}

async function importFile(input) {
  const f = input.files?.[0];
  input.value = "";
  if (!f) return;
  if (f.size > 2_000_000) return say("파일이 너무 큽니다.");
  try {
    const list = decodeSims(await f.text());
    if (!list.length) return say("시뮬레이션 파일이 아니거나 내용이 비어 있습니다.");
    const ids = new Set(list.map((x) => x.id));
    store.set("sims", [...list, ...sims().filter((x) => !ids.has(x.id))]);
    openSim(list[0]);
    say(`${list.length}건을 가져와 이 기기에 저장했습니다.`);
  } catch {
    say("가져오기에 실패했습니다. 이 웹(또는 안드로이드 앱)에서 내보낸 파일인지 확인하세요.");
  }
}
