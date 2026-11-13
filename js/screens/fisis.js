// 금융회사 주요 현황(FISIS): 권역 → 총자산 순 회사 목록(검색·비교 선택) → 회사 상세(재무현황·주요경영지표·최근 제재내역) / 비교.
// 앱의 FisisScreen.kt·FisisApi.kt를 옮겼다. 자료는 서버(/fisis)가 금융통계정보시스템 Open API에서 받아 준다.
import { setHeader } from "../app.js";
import { api, cached, errorText, h, icon, loading, message, store, tabs, toast } from "../core.js";

const SOURCE = "자료출처: 금융감독원 금융통계정보시스템";
const NOTICE = "원본 오류로 인해 일부 수치가 잘못 표시되어 있을 수 있습니다.";
const MAX_COMPARE = 3;
const FIRST_MONTH = "202401";
const BASES = ["별도", "연결"];

export const SECTORS = [
  ["F", "증권"], ["G", "운용"], ["A", "은행"], ["H", "생보"], ["I", "손보"], ["C", "카드"], ["E", "저축은행"], ["M", "부신사"], ["L", "금융지주"],
];
const CARD_PL_LABELS = { revenue: "수익합계", expense: "비용합계", netincome: "당기순이익(손실)" };
const DEFAULT_PL_KEYS = ["revenue", "expense", "opinc", "netincome"];
const CARD_PL_KEYS = ["revenue", "expense", "netincome"];
const FINANCE_LABELS = { assets: "자산총계", liab: "부채총계", equity: "자기자본", revenue: "영업수익", expense: "영업비용", opinc: "영업이익", netincome: "당기순이익" };
const FOREIGN_BROKER = /지점|골드만|모간스탠리|모건스탠리|메릴린치|비엔피|BNP|씨엘에스에이|CLSA|크레디|노무라|맥쿼리|유비에스|UBS|제이피모간|JP모간|도이치|소시에테|나틱시스|다이와|미즈호|HSBC|에이치에스비씨|바클레이|스탠다드차타드|씨티|ING|아이엔지|SMBC|라자드|이스트스프링|아이씨엠|ICM|CMS|씨엠에스|에스지|SG|CGS|CIMB|씨아이엠비|글로벌마켓|알비에스|RBS|스미토모|미쓰비시|도쿄|SBI증권/;
const RATIO_ROWS = {
  F: [["ncr", "순자본비율(개별)"], ["ncr_c", "순자본비율(연결)"], ["lev", "레버리지비율"], ["liq", "유동성비율"]],
  A: [["bis", "BIS기준 자기자본비율"], ["delinq", "총대출채권 연체율"], ["npl", "고정이하여신비율"], ["lcr", "유동성커버리지비율"]],
  H: [["solv", "지급여력비율"]],
  I: [["solv", "지급여력비율"]],
  E: [["bis", "BIS자기자본비율"], ["npl", "고정이하여신비율"], ["delinq", "연체율"], ["liq", "유동성비율"]],
  C: [["adj", "조정자기자본비율"], ["npl", "고정이하채권비율"]],
};
const HOMEPAGES = [
  ["국민은행", "https://www.kbstar.com"], ["신한은행", "https://www.shinhan.com"], ["하나은행", "https://www.kebhana.com"], ["우리은행", "https://www.wooribank.com"],
  ["중소기업은행", "https://www.ibk.co.kr"], ["농협은행", "https://www.nhbank.com"], ["산업은행", "https://www.kdb.co.kr"], ["씨티은행", "https://www.citibank.co.kr"],
  ["SC제일은행", "https://www.standardchartered.co.kr"], ["카카오뱅크", "https://www.kakaobank.com"], ["케이뱅크", "https://www.kbank.com"], ["토스뱅크", "https://www.tossbank.com"],
  ["수협은행", "https://www.suhyup-bank.com"], ["부산은행", "https://www.busanbank.co.kr"], ["아이엠뱅크", "https://www.imbank.co.kr"], ["iM뱅크", "https://www.imbank.co.kr"],
  ["대구은행", "https://www.imbank.co.kr"], ["경남은행", "https://www.knbank.co.kr"], ["광주은행", "https://www.kjbank.com"], ["전북은행", "https://www.jbbank.co.kr"], ["제주은행", "https://www.jejubank.co.kr"],
  ["미래에셋증권", "https://securities.miraeasset.com"], ["삼성증권", "https://www.samsungpop.com"], ["한국투자증권", "https://www.koreainvestment.com"], ["NH투자증권", "https://www.nhqv.com"],
  ["KB증권", "https://www.kbsec.com"], ["신한투자증권", "https://www.shinhansec.com"], ["하나증권", "https://www.hanaw.com"], ["메리츠증권", "https://www.imeritz.com"],
  ["키움증권", "https://www.kiwoom.com"], ["대신증권", "https://www.daishin.com"], ["유안타증권", "https://www.yuantasecurities.co.kr"], ["한화투자증권", "https://www.hanwhawm.com"],
  ["교보증권", "https://www.iprovest.com"], ["현대차증권", "https://www.hmsec.com"], ["SK증권", "https://www.sks.co.kr"], ["유진투자증권", "https://www.eugenefn.com"],
  ["부국증권", "https://www.bookook.co.kr"], ["IBK투자증권", "https://www.ibks.com"], ["BNK투자증권", "https://www.bnkfn.co.kr"], ["카카오페이증권", "https://www.kakaopaysec.com"],
  ["토스증권", "https://www.tossinvest.com"], ["다올투자증권", "https://www.daolsecurities.com"],
  ["삼성자산운용", "https://www.samsungfund.com"], ["미래에셋자산운용", "https://investments.miraeasset.com"], ["KB자산운용", "https://www.kbam.co.kr"],
  ["한국투자신탁운용", "https://www.kim.co.kr"], ["신한자산운용", "https://www.shinhanfund.com"], ["한화자산운용", "https://www.hanwhafund.com"], ["키움투자자산운용", "https://www.kiwoomam.com"],
  ["삼성생명", "https://www.samsunglife.com"], ["한화생명", "https://www.hanwhalife.com"], ["교보생명", "https://www.kyobo.com"], ["신한라이프", "https://www.shinhanlife.co.kr"],
  ["NH농협생명", "https://www.nhlife.co.kr"], ["농협생명", "https://www.nhlife.co.kr"], ["흥국생명", "https://www.heungkuklife.co.kr"], ["동양생명", "https://www.myangel.co.kr"],
  ["ABL생명", "https://www.abllife.co.kr"], ["미래에셋생명", "https://life.miraeasset.com"], ["삼성화재", "https://www.samsungfire.com"], ["현대해상", "https://www.hi.co.kr"],
  ["DB손해보험", "https://www.idbins.com"], ["KB손해보험", "https://www.kbinsure.co.kr"], ["메리츠화재", "https://www.meritzfire.com"], ["한화손해보험", "https://www.hwgeneralins.com"],
  ["롯데손해보험", "https://www.lotteins.co.kr"], ["흥국화재", "https://www.heungkukfire.co.kr"], ["농협손해보험", "https://www.nhfire.co.kr"],
  ["신한카드", "https://www.shinhancard.com"], ["삼성카드", "https://www.samsungcard.com"], ["현대카드", "https://www.hyundaicard.com"], ["국민카드", "https://www.kbcard.com"],
  ["롯데카드", "https://www.lottecard.co.kr"], ["우리카드", "https://pc.wooricard.com"], ["하나카드", "https://www.hanacard.co.kr"], ["비씨카드", "https://www.bccard.com"],
  ["SBI저축은행", "https://www.sbisb.co.kr"], ["OK저축은행", "https://www.oksavingsbank.com"], ["웰컴저축은행", "https://www.welcomebank.co.kr"],
];

export const cleanCompanyName = (name) => String(name || "").replace(/\(\s*주\s*\)|㈜|주식회사/g, " ").replace(/\s+/g, " ").trim();
const monthLabel = (m) => (/^\d{6}$/.test(m) ? `${m.slice(0, 4)}.${m.slice(4)}` : m);
const termLabel = (t) => ({ Q: "분기", H: "반기", Y: "연간" })[t] || "";

function unitMultiplier(unit) {
  const u = String(unit || "").replace(/ /g, "");
  if (u.includes("조")) return 1e12;
  if (u.includes("억")) return 1e8;
  if (u.includes("백만")) return 1e6;
  if (u.includes("천만")) return 1e7;
  if (u.includes("만원") || u === "만") return 1e4;
  if (u.includes("천원") || u === "천") return 1e3;
  if (u.includes("원")) return 1;
  return null;
}
const won = (v, unit) => v * (unitMultiplier(unit) ?? 1);
const fmt = (n, d) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** 금액은 억원(10억원 이상은 소수점 없이), 비율은 소수 둘째 자리 %. */
export function valueText(value, unit) {
  if (String(unit).includes("%")) return fmt(value, 2) + "%";
  const mult = unitMultiplier(unit);
  if (mult == null) return fmt(value, 2).replace(/\.?0+$/, "") + unit;
  const eok = (value * mult) / 1e8;
  if (Math.abs(eok) >= 10 || eok === 0) return Math.round(eok).toLocaleString("en-US") + "억원";
  return fmt(eok, 2).replace(/\.?0+$/, "") + "억원";
}

function homepage(name) {
  const key = name.replace(/\s|\(주\)|주식회사|㈜/g, "");
  const hit = HOMEPAGES.find(([k]) => key.toLowerCase().includes(k.toLowerCase()));
  return hit ? { url: hit[1], known: true } : { url: "https://www.google.com/search?q=" + encodeURIComponent(name + " 공식 홈페이지"), known: false };
}

// ---- 자료 ----
const companies = (sector) => cached("fisis:co:" + sector, 6 * 3600e3, async () =>
  ((await api("/fisis/companies", { sector })).items || []).map((c) => ({ code: c.code, name: cleanCompanyName(c.name) })).filter((c) => c.code && c.name).sort((a, b) => a.name.localeCompare(b.name, "ko")));
const ranking = (sector) => cached("fisis:rank:" + sector, 6 * 3600e3, () => api("/fisis/ranking", { sector, offset: 0 }));
const profileOf = (sector, code) => cached(`fisis:p:${sector}:${code}`, 6 * 3600e3, async () => {
  const p = await api("/fisis/profile", { sector, finance: code });
  return { ...p, name: cleanCompanyName(p.name), metrics: p.metrics || [], basisOptions: p.basisOptions || [] };
});

const at = (metric, month) => {
  if (!metric) return null;
  const pts = metric.points || [];
  return month == null ? pts[pts.length - 1] : pts.find((p) => p.month === month);
};
const group = (p, g, basis) => p.metrics.filter((m) => m.group === g && (basis == null || m.basis === basis || !m.basis));
const metricOf = (p, key, basis) => p.metrics.find((m) => m.key === key && (basis == null || m.basis === basis || !m.basis));
const monthsOf = (metrics) => [...new Set(metrics.flatMap((m) => (m.points || []).map((x) => x.month)))].filter((m) => m >= FIRST_MONTH).sort().reverse();
function amountOnly(metric, month) {
  const v = at(metric, month)?.value;
  return metric && v != null ? valueText(v, metric.unit).replace(/억원$/, "") : null;
}

const picks = () => store.get("fisis.picks", []);
function togglePick(sector, c) {
  let list = picks().filter((p) => p.sector === sector);
  if (list.some((p) => p.code === c.code)) list = list.filter((p) => p.code !== c.code);
  else if (list.length >= MAX_COMPARE) return toast(`비교는 ${MAX_COMPARE}곳까지 담을 수 있습니다.`), false;
  else list.push({ sector, code: c.code, name: c.name });
  store.set("fisis.picks", list);
  return true;
}

export async function render(root, params, ctx) {
  const sector = SECTORS.some(([c]) => c === params.sector) ? params.sector : store.get("fisis.sector", "F");
  if (params.tool === "risk") return riskPane(root, params, ctx, sector);
  if (params.co) return detail(root, params, ctx, sector);
  if (params.compare) return compare(root, params, ctx, sector);
  return list(root, params, ctx, sector);
}

/** 리스크 대시보드(건전성 추이·지배구조·제재 이력, 업권 사분면·현황)를 이 메뉴 안에서 보여 준다. */
async function riskPane(root, params, ctx, sector) {
  const [view, live, core] = await Promise.all([import("./risk-view.js"), import("../lib/risk-live.js"), import("../core.js")]);
  const { tool, ...rest } = params;
  return view.mountRisk(root, rest, {
    provider: live.liveProvider(), setHeader, openUrl: core.openUrl,
    go: (p) => ctx.go({ tool: "risk", ...p }),
    extraTab: { label: "회사 목록", onSelect: () => ctx.go({ sector: SECTORS.some(([c]) => c === rest.sector) ? rest.sector : sector }) },
  });
}
/** 회사 목록·상세 화면 맨 위의 탭 줄: 회사 목록 / 리스크 대시보드 쪽 화면들. */
const toolTabs = (ctx, sector, current = 0) => tabs(["회사 목록", "회사 대시보드", "업권 Peer 사분면", "업권 현황"], current, (i) => {
  if (i === 0) return ctx.go({ sector });
  ctx.go({ tool: "risk", sector: i === 3 || !SECTORS_RISK.includes(sector) ? (i === 3 ? sector : "A") : sector, view: ["", "peer", "overview"][i - 1] || null });
});
const SECTORS_RISK = ["A", "F", "H", "I", "C", "E"];

async function list(root, params, ctx, sector) {
  setHeader("금융회사 주요 현황", "회사명으로 검색해 경영지표를 비교 · " + SOURCE);
  root.append(toolTabs(ctx, sector));
  const label = SECTORS.find(([c]) => c === sector)[1];
  root.append(h("div", { class: "row-gap", style: { marginBottom: "10px" } },
    SECTORS.map(([c, l]) => h("button", { class: "pill" + (c === sector ? " on" : ""), type: "button", onclick: () => (store.set("fisis.sector", c), ctx.go({ sector: c }, { replace: true })) }, l))));
  const input = h("input", { type: "search", placeholder: `${label} 회사 이름 검색`, value: params.q || "" });
  root.append(h("div", { class: "search" }, icon("search"), input));
  const info = h("div", { class: "section-label", style: { fontWeight: 500 } });
  const body = h("div", { class: "card list" }, loading());
  root.append(info, body);

  let all = [];
  let assets = {};
  // 운용사(G)는 총자산이 아니라 금융투자협회 펀드 순자산(최근일자 공모+사모) 기준으로 순위를 매긴다. 자료가 없는 회사는 맨 뒤.
  let fundMod = null;
  let fundData = null;
  const fundOf = (c) => {
    const f = fundData && fundMod.findCompany(fundData, c.name, "G");
    const v = f ? f.pub[0] + f.pri[0] : 0;
    return v > 0 ? v : null;
  };
  const drawInfo = () => {
    const ps = picks().filter((p) => p.sector === sector);
    info.replaceChildren(
      h("span", null, ps.length ? `비교 선택 ${ps.length}/${MAX_COMPARE}: ${ps.map((p) => p.name).join(", ")}` : `회사를 누르면 상세, 체크하면 비교(최대 ${MAX_COMPARE}곳) · ${NOTICE}`),
      h("div", { class: "acts" },
        ps.length ? h("button", { class: "btn ghost sm", type: "button", onclick: () => (store.set("fisis.picks", picks().filter((p) => p.sector !== sector)), draw()) }, "선택 해제") : null,
        ps.length >= 2 ? h("button", { class: "btn sm", type: "button", onclick: () => ctx.go({ sector, compare: ps.map((p) => p.code).join(",") }) }, "비교하기") : null));
  };
  const draw = () => {
    drawInfo();
    const q = input.value.trim().toLowerCase();
    const sorted = [...all].sort((a, b) => {
      const fa = sector === "F" && FOREIGN_BROKER.test(a.name) ? 1 : 0;
      const fb = sector === "F" && FOREIGN_BROKER.test(b.name) ? 1 : 0;
      if (fa !== fb) return fa - fb;
      if (fundData) {
        const na = fundOf(a), nb = fundOf(b);
        if ((na == null) !== (nb == null)) return na == null ? 1 : -1;
        if (na !== nb) return nb - na;
        return a.name.localeCompare(b.name, "ko");
      }
      const va = assets[a.code] ? won(assets[a.code].value, assets[a.code].unit) : -Infinity;
      const vb = assets[b.code] ? won(assets[b.code].value, assets[b.code].unit) : -Infinity;
      if (va !== vb) return vb - va;
      return a.name.localeCompare(b.name, "ko");
    });
    const shown = sorted.filter((c) => !q || c.name.toLowerCase().includes(q));
    const ps = new Set(picks().filter((p) => p.sector === sector).map((p) => p.code));
    body.replaceChildren(...(shown.length ? shown.map((c, i) => {
      const a = assets[c.code];
      const fv = fundData ? fundOf(c) : null;
      const cb = h("input", { type: "checkbox", title: "비교에 담기", "aria-label": `${c.name} 비교에 담기` });
      cb.checked = ps.has(c.code);
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        if (!togglePick(sector, c)) cb.checked = false;
        drawInfo();
      });
      return h("div", { class: "item co-row", onclick: () => ctx.go({ sector, co: c.code }) },
        h("span", { class: "avatar" }, c.name.replace(/^(주식회사|㈜)/, "").trim().slice(0, 1)),
        h("div", { class: "body" }, h("div", { class: "t" }, c.name), fundData
          ? h("div", { class: "m" }, fv != null ? `${q ? "" : `${i + 1}위 · `}펀드 순자산 ${fundMod.eokText(fv)}원 (${fundMod.dateLabel(fundData.asOf.recent)})` : "펀드 순자산 자료 없음")
          : a ? h("div", { class: "m" }, `${q ? "" : `${i + 1}위 · `}총자산 ${valueText(a.value, a.unit)} (${monthLabel(a.month)})`) : null),
        h("label", { class: "acts", onclick: (e) => e.stopPropagation() }, cb));
    }) : [message("검색 결과가 없습니다.")]));
  };
  input.addEventListener("input", draw);
  try {
    [all, assets] = await Promise.all([companies(sector), ranking(sector).then((r) => r.assets || {}).catch(() => ({}))]);
    if (sector === "G") {
      try {
        fundMod = await import("../lib/fundaum.js");
        fundData = await fundMod.loadFundAum();
      } catch {
        fundData = null; // 자료를 못 받으면 총자산 순서로 대신 보여 준다
      }
    }
    if (ctx.alive()) draw();
  } catch (e) {
    body.replaceChildren(message(errorText(e), { error: true, action: "다시 시도", onAction: () => ctx.go({ sector }, { replace: true }) }));
  }
}

function periodPicker(months, selected, term, onSelect) {
  if (!months.length) return null;
  return h("div", { class: "period" }, h("div", { class: "note" }, `시점 선택(${termLabel(term) || "기준"})`),
    h("div", { class: "row-gap" }, months.map((m) => h("button", { class: "pill" + (m === selected ? " on" : ""), type: "button", onclick: () => onSelect(m) }, monthLabel(m)))));
}
const sectionHeader = (title, unit = "단위: 억원") => h("div", { class: "section-label", style: { marginTop: "14px" } }, h("span", { style: { color: "var(--acc-fg)" } }, title), unit ? h("div", { class: "acts note" }, unit) : null);

async function detail(root, params, ctx, sector) {
  const sectorLabel = SECTORS.find(([c]) => c === sector)[1];
  const all = await companies(sector).catch(() => []);
  const co = all.find((c) => c.code === params.co) || { code: params.co, name: params.name || params.co };
  setHeader(co.name, `${sectorLabel} · ${SOURCE}${sector === "F" || sector === "G" ? ", 금융투자협회(FreeSIS)" : ""}`, [
    h("button", { class: "pill", type: "button", title: "PDF·한글로 저장", onclick: () => saveCompany(sector, sectorLabel, co, params) }, icon("download"), h("span", { class: "lbl" }, "저장")),
    SECTORS_RISK.includes(sector) ? h("button", { class: "pill", type: "button", title: "리스크 대시보드", onclick: () => ctx.go({ tool: "risk", sector, co: co.code }) }, icon("activity"), h("span", { class: "lbl" }, "리스크 대시보드")) : null,
    h("button", { class: "pill", type: "button", onclick: () => history.back() }, icon("chevron-left"), h("span", { class: "lbl" }, "목록")),
  ]);
  // 증권사·운용사는 금융투자협회의 펀드 순자산 탭을 더한다.
  // 증권사는 협회 자료에 그 회사 자체 수치가 있을 때만(소수) 보이고, 없으면 탭을 숨긴다. 운용사는 항상 보인다.
  let showFund = sector === "G";
  if (sector === "F") {
    const fm = await import("../lib/fundaum.js");
    showFund = await fm.loadFundAum().then((d) => !!fm.findCompany(d, co.name, "F"), () => false);
  }
  const tabNames = ["재무현황", "주요경영지표", ...(showFund ? ["펀드 순자산"] : []), "최근 제재내역"];
  const tab = Math.min(+(params.tab || 0), tabNames.length - 1);
  const tabName = tabNames[tab];
  root.append(tabs(tabNames, tab, (i) => ctx.go({ ...params, tab: i }, { replace: true })));
  const body = h("div");
  root.append(body);
  if (tabName === "최근 제재내역") {
    const m = await import("./sanction.js");
    return m.companyPane(body, co.name);
  }
  if (tabName === "펀드 순자산") {
    const m = await import("../lib/fundaum.js");
    return m.fundAumPane(body, co.name, sector);
  }
  body.append(loading("경영정보를 불러오는 중…"));
  let profile;
  try {
    profile = await profileOf(sector, co.code);
  } catch (e) {
    return body.replaceChildren(message(errorText(e), { error: true, action: "다시 시도", onAction: () => ctx.go(params, { replace: true }) }));
  }
  if (!ctx.alive()) return;
  if (!profile.metrics.length) return body.replaceChildren(message(`이 회사는 ${sectorLabel} 자료를 찾지 못했습니다.`));
  const basis = BASES.includes(params.basis) ? params.basis : "별도";
  body.replaceChildren();
  if (tab === 0) {
    body.append(h("div", { class: "row-gap" }, BASES.map((b) => h("button", { class: "pill" + (b === basis ? " on" : ""), type: "button", onclick: () => ctx.go({ ...params, basis: b, fm: null }, { replace: true }) }, `${b} 재무제표`))));
    financeTab(body, sector, profile, basis, params.fm, (m) => ctx.go({ ...params, fm: m }, { replace: true }));
    const home = homepage(co.name);
    body.append(h("a", { class: "btn ghost", href: home.url, target: "_blank", rel: "noopener", style: { marginTop: "14px" } }, icon("external-link"), home.known ? `홈페이지 열기 (${home.url.replace("https://", "")})` : "공식 홈페이지 검색하기"));
  } else {
    ratioTab(body, sector, profile, params.rm, +(params.span || 4), (p) => ctx.go({ ...params, ...p }, { replace: true }));
  }
  body.append(h("p", { class: "note", style: { marginTop: "12px" } }, `${SOURCE}. 금액은 억원 단위입니다. ${NOTICE}`));
}

function financeTab(body, sector, profile, basis, month, onMonth) {
  const fin = group(profile, "fin", basis).filter((m) => m.basis === basis);
  const funds = group(profile, "fund");
  const months = monthsOf([...fin, ...funds]);
  const selected = months.includes(month) ? month : months[0];
  body.append(periodPicker(months, selected, profile.term, onMonth) || "");
  if (!fin.length) {
    body.append(h("p", { class: "note", style: { margin: "10px 0" } }, basis === "연결" ? "금융통계시스템엔 연결 재무정보 없음" : `${basis} 재무제표 자료가 없습니다.`));
    if (basis === "연결") return;
  }
  const metric = (k) => fin.find((m) => m.key === k);
  body.append(sectionHeader(`재무상태 (${basis})`));
  body.append(h("div", { class: "grid3 bal" }, ["assets", "liab", "equity"].map((k) => h("div", { class: "kpi" + (k === "assets" ? " hl" : "") }, h("small", null, FINANCE_LABELS[k]), h("b", null, amountOnly(metric(k), selected) ?? "-")))));
  const liab = at(metric("liab"), selected)?.value;
  const eq = at(metric("equity"), selected)?.value;
  if (liab > 0 && eq > 0) {
    const share = Math.min(0.98, Math.max(0.02, liab / (liab + eq)));
    body.append(h("div", { class: "share-bar" }, h("span", { style: { flex: share } }), h("span", { style: { flex: 1 - share } })),
      h("div", { class: "note" }, `■ 부채 ${(share * 100).toFixed(1)}%   ■ 자기자본 ${((1 - share) * 100).toFixed(1)}%`));
  }
  body.append(sectionHeader(`손익현황 (${basis})`));
  const current = { H: "당반기", Y: "당기" }[profile.term] || "당분기";
  const card = sector === "C";
  const cell = (m) => {
    const v = at(m, selected)?.value;
    return h("td", { class: "num" + (v != null && v < 0 ? " neg" : "") }, amountOnly(m, selected) ?? "-");
  };
  body.append(h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
    h("thead", null, h("tr", null, h("th", null, "항목"), h("th", { class: "num" }, current), h("th", { class: "num" }, "누적"))),
    h("tbody", null, (card ? CARD_PL_KEYS : DEFAULT_PL_KEYS).map((k) => h("tr", { class: k === "netincome" ? "bold" : "" },
      h("td", null, (card ? CARD_PL_LABELS[k] : null) || FINANCE_LABELS[k]), cell(metric(k)), cell(metric(k + "_cum"))))))));
  if (funds.length) {
    body.append(sectionHeader("펀드 설정원본 · 순자산", null));
    body.append(h("div", { class: "card list" }, funds.map((m) => {
      const v = at(m, selected)?.value;
      return h("div", { class: "item" }, h("div", { class: "body" }, m.label), h("b", null, v != null ? valueText(v, m.unit) : "-"));
    })));
  }
}

function ratioTab(body, sector, profile, month, span, set) {
  const rows = RATIO_ROWS[sector];
  if (!rows) return body.append(message("이 권역은 주요경영지표를 제공하지 않습니다."));
  const ratios = group(profile, "ratio");
  const months = monthsOf(ratios);
  const selected = months.includes(month) ? month : months[0];
  body.append(periodPicker(months, selected, ratios[0]?.term || profile.term, (m) => set({ rm: m })) || "");
  body.append(h("div", { class: "row-gap", style: { margin: "8px 0" } }, [4, 8].map((n) => h("button", { class: "pill" + (span === n ? " on" : ""), type: "button", onclick: () => set({ span: n }) }, `최근 ${n}${termLabel(profile.term) || "개 시점"}`))));
  body.append(sectionHeader("주요경영지표", "단위: %"));
  const start = Math.max(0, months.indexOf(selected));
  const shown = months.slice(start, start + span);
  body.append(h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
    h("thead", null, h("tr", null, h("th", null, "지표"), shown.map((m) => h("th", { class: "num" + (m === selected ? " sel" : "") }, monthLabel(m))))),
    h("tbody", null, rows.map(([k, label]) => {
      const metric = ratios.find((m) => m.key === k);
      return h("tr", null, h("td", null, label), shown.map((m) => {
        const v = at(metric, m)?.value;
        return h("td", { class: "num" + (m === selected ? " sel" : "") }, v != null && metric ? valueText(v, metric.unit).replace(/%$/, "") : "-");
      }));
    })))));
  body.append(h("p", { class: "note" }, "선택한 시점 열은 강조됩니다."));
}

async function compare(root, params, ctx, sector) {
  setHeader("회사 비교", SOURCE, [h("button", { class: "pill", type: "button", onclick: () => history.back() }, icon("chevron-left"), h("span", { class: "lbl" }, "목록"))]);
  const codes = params.compare.split(",").slice(0, MAX_COMPARE);
  const all = await companies(sector).catch(() => []);
  const cos = codes.map((c) => all.find((x) => x.code === c) || { code: c, name: c });
  root.append(loading("경영정보를 불러오는 중…"));
  let profiles;
  try {
    profiles = await Promise.all(cos.map((c) => profileOf(sector, c.code)));
  } catch (e) {
    return root.replaceChildren(message(errorText(e), { error: true, action: "다시 시도", onAction: () => ctx.go(params, { replace: true }) }));
  }
  if (!ctx.alive()) return;
  root.replaceChildren();
  const row = (label, key, pct) => h("tr", null, h("td", null, label), profiles.map((p) => {
    const m = metricOf(p, key, "별도");
    const v = at(m, null)?.value;
    return h("td", { class: "num" + (v != null && v < 0 ? " neg" : "") }, m && v != null ? valueText(v, m.unit).replace(pct ? /%$/ : /억원$/, "") : "-");
  }));
  const section = (title, unit, rows) => [sectionHeader(title, unit), h("div", { class: "tbl-wrap" }, h("table", { class: "tbl cmp" },
    h("thead", null, h("tr", null, h("th", null, ""), cos.map((c) => h("th", { class: "num" }, c.name)))),
    h("tbody", null, rows)))];
  root.append(h("div", { class: "note" }, "기준 시점: " + profiles.map((p, i) => `${cos[i].name} ${monthLabel(monthsOf(group(p, "fin", "별도"))[0] || "-")}`).join(" · ")));
  root.append(...section("재무상태", "단위: 억원", ["assets", "liab", "equity"].map((k) => row(FINANCE_LABELS[k], k, false))));
  root.append(...section("손익현황 (누적)", "단위: 억원", ["revenue", "opinc", "netincome"].map((k) => row(FINANCE_LABELS[k] + " (누적)", k + "_cum", false))));
  if (RATIO_ROWS[sector]) root.append(...section("주요경영지표", "단위: %", RATIO_ROWS[sector].map(([k, l]) => row(l, k, true))));
  root.append(h("p", { class: "note", style: { marginTop: "10px" } }, "각 회사의 FISIS 최근 시점 기준입니다. 시점이 다르면 위의 기준 시점을 확인하세요."));
}

// ---- PDF·한글 저장: 재무현황·주요경영지표·최근 제재내역 ----
async function saveCompany(sector, sectorLabel, co, params) {
  const { saveReport } = await import("../lib/report.js");
  await saveReport({
    title: `${co.name} 저장`,
    parts: [
      { id: "fin", label: "재무현황 (별도·연결)" },
      { id: "ratio", label: RATIO_ROWS[sector] ? "주요경영지표 (최근 8개 시점)" : "주요경영지표 (이 권역은 제공 안 함)", checked: !!RATIO_ROWS[sector] },
      { id: "sanction", label: "최근 제재내역 (2011년 이후 금감원 제재공시)" },
    ],
    build: (ids) => companyDoc(ids, sector, sectorLabel, co, params),
  });
}

async function companyDoc(ids, sector, sectorLabel, co, params) {
  const profile = await profileOf(sector, co.code);
  const sections = [];
  const term = termLabel(profile.term) || "기준";
  if (ids.has("fin")) {
    const funds = group(profile, "fund");
    const allFin = group(profile, "fin").filter((m) => m.basis);
    const month = (() => {
      const ms = monthsOf([...allFin, ...funds]);
      return ms.includes(params.fm) ? params.fm : ms[0];
    })();
    const blocks = [];
    const card = sector === "C";
    const current = { H: "당반기", Y: "당기" }[profile.term] || "당분기";
    for (const basis of BASES) {
      const fin = allFin.filter((m) => m.basis === basis);
      if (!fin.length) {
        if (basis === "연결") blocks.push({ text: "연결 재무제표: 금융통계정보시스템에 연결 재무정보가 없습니다.", gray: true });
        continue;
      }
      const metric = (k) => fin.find((m) => m.key === k);
      const liab = at(metric("liab"), month)?.value, eq = at(metric("equity"), month)?.value;
      const bal = ["assets", "liab", "equity"].map((k) => [FINANCE_LABELS[k], amountOnly(metric(k), month) ?? "-"]);
      if (liab > 0 && eq > 0) bal.push(["부채비율(부채÷자기자본)", ((liab / eq) * 100).toFixed(1) + "%"]);
      blocks.push({ heading: `재무상태 (${basis}) · 단위 억원` }, { table: { head: ["항목", "금액"], rows: bal, weights: [2, 1] } });
      const keys = card ? CARD_PL_KEYS : DEFAULT_PL_KEYS;
      blocks.push({ heading: `손익현황 (${basis}) · 단위 억원` }, {
        table: {
          head: ["항목", current, "누적"],
          rows: keys.map((k) => [(card ? CARD_PL_LABELS[k] : null) || FINANCE_LABELS[k], amountOnly(metric(k), month) ?? "-", amountOnly(metric(k + "_cum"), month) ?? "-"]),
          bold: (i) => keys[i] === "netincome",
        },
      });
    }
    if (funds.length) blocks.push({ heading: "펀드 설정원본 · 순자산" }, { table: { head: ["항목", "금액"], rows: funds.map((m) => [m.label, at(m, month)?.value != null ? valueText(at(m, month).value, m.unit) : "-"]), weights: [2, 1] } });
    if (!blocks.length) blocks.push({ text: "재무 자료가 없습니다.", gray: true });
    sections.push({ title: "재무현황", note: `기준 시점: ${month ? monthLabel(month) : "-"} (${term})`, blocks });
  }
  if (ids.has("ratio")) {
    const rows = RATIO_ROWS[sector];
    const ratios = group(profile, "ratio");
    const months = monthsOf(ratios);
    const start = Math.max(0, months.indexOf(params.rm));
    const shown = months.slice(start, start + 8).reverse();
    sections.push({
      title: "주요경영지표",
      note: "단위: %",
      blocks: rows && shown.length
        ? [{ table: { head: ["지표", ...shown.map(monthLabel)], weights: [2.2, ...shown.map(() => 1)], rows: rows.map(([k, label]) => {
            const m = ratios.find((x) => x.key === k);
            return [label, ...shown.map((mo) => {
              const v = at(m, mo)?.value;
              return v != null && m ? valueText(v, m.unit).replace(/%$/, "") : "-";
            })];
          }) } }]
        : [{ text: "이 권역은 주요경영지표를 제공하지 않거나 자료가 없습니다.", gray: true }],
    });
  }
  if (ids.has("sanction")) {
    const S = await import("../lib/sanctions.js");
    const data = await S.loadSanctions();
    const cases = S.casesOf(data, co.name);
    const blocks = [];
    if (!cases.length) blocks.push({ text: `${data.fromYear}년 이후 금감원 제재공시에서 ‘${co.name}’ 이름으로 된 공시를 찾지 못했습니다.`, gray: true });
    cases.forEach((c, i) => {
      blocks.push({ heading: `${i + 1}. ${c.company} · ${String(c.date || "").replace(/-/g, ".")}${c.dept ? " · " + c.dept : ""}` });
      const acts = [];
      const inst = S.actionLine(c.inst);
      if (inst) acts.push(["기관", inst]);
      if (!c.inst && c.fine + c.penalty > 0) acts.push(["금전", [c.fine > 0 ? `과태료 ${S.won(c.fine)}` : null, c.penalty > 0 ? `과징금 ${S.won(c.penalty)}` : null].filter(Boolean).join(", ")]);
      const ex = S.actionLine(c.exec);
      if (ex) acts.push(["임원", ex]);
      const sf = S.actionLine(c.staff);
      if (sf) acts.push(["직원", sf]);
      blocks.push({ text: "[조치내용]", indent: 1 });
      if (acts.length) blocks.push({ kv: acts });
      else blocks.push({ text: "표시할 조치내용이 없습니다. 원문을 확인해 주세요.", gray: true, indent: 1 });
      blocks.push({ text: "[지적사항]", indent: 1 });
      if (c.items.length) blocks.push({ text: c.items.map((it, j) => `${j + 1}) ${it.category ? `[${it.category}] ` : ""}${it.title}${it.laws.length ? ` (${it.laws.join(", ")})` : ""}`).join("\n"), indent: 1 });
      else blocks.push({ text: S.whyText(c), gray: true, indent: 1 });
      if (c.viewUrl) blocks.push({ text: "원문: " + c.viewUrl, gray: true, indent: 1 });
    });
    sections.push({ title: "최근 제재내역", note: `${data.fromYear}년 이후 금감원 제재공시 ${cases.length}건 · 회사명으로 맞춘 참고 자료이니 업무에는 원문을 확인하세요.`, blocks });
  }
  return {
    title: co.name,
    subtitle: "금융회사 주요 현황",
    fileName: `${co.name}_금융회사현황`,
    meta: [`권역: ${sectorLabel}   ·   출력: ${new Date().toLocaleDateString("ko-KR")}`],
    sections,
    footer: [`${SOURCE}. ${NOTICE}`, ids.has("sanction") ? "제재내역 출처: 금융감독원 금융회사 제재공시" : ""],
  };
}
