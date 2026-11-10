// 가상자산 시장 동향: 시장 요약 · 주요코인 시세 · 거래소별 현황 · 해외 시장 비교 · 시장 일보.
// 자료는 국내 원화거래소 5곳을 매일 12:00·24:00(KST)에 집계한 일보 JSON을 읽는다. 투자 권유가 아니다.
import { setHeader } from "../app.js";
import { h, icon, loading, message, errorText, openUrl, tabs } from "../core.js";
import {
  EXCHANGE_NAMES, EXCHANGE_ORDER, absoluteUrl, axisLabel, barChartSvg, diffOf, donutSvg, formatNumber, formatPct, formatPp, formatPrice, formatUsdTrillion,
  formatWon, hbarsHtml, lineChartSvg, loadMarket, nextSlotText, ratio, reportTitle, shortSlotDate, sign, whenText,
} from "../lib/crypto.js";

const TABS = [["summary", "시장 요약"], ["coins", "주요코인 시세"], ["exchange", "거래소별 현황"], ["global", "해외 시장 비교"], ["report", "시장 일보"]];
const MAJORS = ["BTC", "ETH", "XRP", "SOL", "DOGE", "ADA", "USDT"];
const C = { primary: "var(--acc)", global: "#7c5cff", up: "var(--up)", down: "var(--down)" };

let data = null;
const S = { coin: null, year: false, exchange: "upbit" };

export async function render(root, params, ctx) {
  setHeader("가상자산 시장 동향", "국내 원화거래소 5곳 · 매일 12:00·24:00 집계", [
    h("button", { class: "btn ghost sm", type: "button", onclick: () => { data = null; ctx.go({ ...params }, { replace: true }); }, title: "새로고침" }, icon("refresh-cw"), h("span", { class: "hide-sm" }, "새로고침")),
  ]);
  const idx = Math.max(0, TABS.findIndex(([k]) => k === params.tab));
  root.append(tabs(TABS.map((t) => t[1]), idx, (i) => ctx.go({ tab: TABS[i][0] }, { replace: false })));
  const body = h("div", { class: "cx" }, loading());
  root.append(body);
  try {
    data ||= await loadMarket();
  } catch (e) {
    if (!ctx.alive()) return;
    body.replaceChildren(message(errorText(e), { error: true, action: "다시 시도", onAction: () => ctx.go({ ...params }, { replace: true }) }));
    return;
  }
  if (!ctx.alive()) return;
  const view = { summary, coins, exchange, global: globalView, report }[TABS[idx][0]];
  body.replaceChildren(...view(ctx));
  body.append(h("p", { class: "note cx-foot" }, "정보 제공용이며 투자 권유가 아닙니다. 출처: 각 거래소 공개 API, ",
    (data.snapshot.global?.source || "CoinGecko"), ", Coinbase, 업비트. 금융감독원 공식 자료가 아닙니다."));
}

// ---- 부품 ----
const el = (html) => { const d = h("div"); d.innerHTML = html; return d; };
function kpi(label, value, sub, sg = 0) {
  return h("div", { class: "cx-kpi" }, h("small", null, label), h("b", null, value), sub ? h("span", { class: sg > 0 ? "up" : sg < 0 ? "down" : "" }, sub) : null);
}
function box(title, subtitle, ...kids) {
  return h("section", { class: "card cx-box" }, h("div", { class: "ch" }, h("h3", null, title), subtitle ? h("small", { class: "note cx-sub" }, subtitle) : null), h("div", { class: "cx-bd" }, ...kids));
}
const chgCell = (r, d = 2) => h("span", { class: r > 0 ? "up" : r < 0 ? "down" : "" }, formatPct(r, d, true));
function table(head, rows) {
  return h("div", { class: "tbl-wrap" }, h("table", { class: "tbl cx-tbl" },
    h("thead", null, h("tr", null, head.map((x, i) => h("th", { class: i ? "num" : "" }, x)))),
    h("tbody", null, rows.map((r) => h("tr", null, r.map((c, i) => h("td", { class: i ? "num" : "" }, c)))))));
}
const kpiRow = (...k) => h("div", { class: "cx-kpis" }, ...k);
const pct = (v) => (v == null ? "-" : formatPct(v));
const asOf = (s) => h("p", { class: "note" }, `${whenText(s)} 집계 (다음 ${nextSlotText(s)}) · 수집 ${s.collected_at || "-"} · 원화마켓 5개 거래소 합산`);

// ---- 시장 요약 ----
function summary() {
  const s = data.snapshot, prev = data.previous, d = s.domestic || {}, g = s.global || {};
  const out = [asOf(s)];
  const c1 = ratio(d.total_value_24h, prev?.total_value_24h), c2 = ratio(d.btc_price_krw, prev?.btc_price_krw), c3 = diffOf(g.kimchi_premium, prev?.kimchi_premium);
  out.push(kpiRow(
    kpi("국내 24h 거래대금", formatWon(d.total_value_24h) + " 원", c1 != null ? "전일 대비 " + formatPct(c1, 1, true) : "", sign(c1)),
    kpi("BTC 가격(업비트)", formatPrice(d.btc_price_krw) + " 원", c2 != null ? "전일 대비 " + formatPct(c2, 1, true) : "", sign(c2)),
    kpi("김치 프리미엄", formatPct(g.kimchi_premium, 1, true), c3 != null ? "전일 대비 " + formatPp(c3) : "", sign(c3)),
    kpi("BTC 도미넌스 국내 vs 글로벌", `${pct(d.btc_dominance)} / ${pct(g.btc_dom_volume)}`, `거래대금 기준 · 시총 기준 글로벌 ${pct(g.btc_dom_mcap)}`)));
  const hist = data.history.slice(-30);
  out.push(h("div", { class: "grid2" },
    box("국내 거래대금 추이", `최근 ${hist.length}회 집계, 5개 거래소 합계`, el(barChartSvg(hist.map((x) => x.total_value_24h || 0), hist.map((x) => shortSlotDate(x.date, x.slot)), C.primary))),
    box("거래소 점유율", "24시간 거래대금 기준", el(donutSvg((s.exchanges || []).filter((e) => e.ok && (e.value_24h || 0) > 0)
      .map((e, i) => ({ label: e.name, value: e.value_24h, color: ["var(--acc)", "#7c5cff", "#0f7b62", "#a36200", "#b9431a"][i % 5] })))))));
  out.push(h("div", { class: "grid2" },
    box("거래대금 상위", "5개 거래소 합산", table(["종목", "등락", "거래대금"], (s.top || []).slice(0, 6).map((r) => [r.symbol, chgCell(r.change_rate), formatWon(r.value_24h)]))),
    box("주요코인 시세(업비트)", "원화 · 오늘 변동률", (data.coins?.coins || []).length
      ? table(["코인", "현재가", "당일"], data.coins.coins.slice(0, 3).map((c) => [c.symbol, formatPrice(c.price), chgCell(c.day?.change_rate)]))
      : h("p", { class: "note" }, "시세 데이터가 아직 없습니다."),
    h("a", { class: "link-more", href: "#/crypto?tab=coins" }, "더보기 ›"))));
  const items = [];
  if (g.btc_dom_mcap != null) items.push(["글로벌 · 시가총액", g.btc_dom_mcap, C.global]);
  if (g.btc_dom_volume != null) items.push(["글로벌 · 거래대금", g.btc_dom_volume, "#7c5cff99"]);
  if (d.btc_dominance != null) items.push(["국내 합계 · 거래대금", d.btc_dominance, C.primary]);
  for (const e of s.exchanges || []) if (e.ok && e.btc_dominance != null) items.push(["　" + e.name, e.btc_dominance, "#1f6feb80"]);
  out.push(box("BTC 도미넌스 비교", "국내 = BTC 원화 거래대금 ÷ 전체 원화 거래대금", el(hbarsHtml(items, Math.max(0.1, ...items.map((x) => x[1])) * 1.1))));
  const listings = Object.entries(s.listings || {}).filter(([, l]) => l.listed?.length || l.delisted?.length);
  out.push(box("신규 상장·상장 폐지", "직전 집계 원화마켓 목록 대비", listings.length
    ? h("div", { class: "stack" }, listings.map(([ex, l]) => h("div", null, h("b", null, EXCHANGE_NAMES[ex] || ex),
      l.listed?.length ? h("div", { class: "up" }, "상장: " + l.listed.join(", ")) : null, l.delisted?.length ? h("div", { class: "down" }, "폐지: " + l.delisted.join(", ")) : null)))
    : h("p", { class: "note" }, "변동 없음")));
  out.push(latestReport());
  const errs = Object.keys(s.errors || {});
  if (errs.length) out.push(h("p", { class: "note err" }, `수집 실패: ${errs.join(", ")} (해당 값은 표에서 빠짐)`));
  return out;
}

function reportButtons(r) {
  return h("div", { class: "row-gap" },
    h("button", { class: "btn sm", type: "button", onclick: () => openUrl(absoluteUrl(r.pdf)) }, icon("file-text"), "PDF"),
    r.hwpx ? h("button", { class: "btn ghost sm", type: "button", onclick: () => openUrl(absoluteUrl(r.hwpx)) }, icon("file-down"), "HWPX") : null);
}
function latestReport() {
  const r = data.reports[0];
  return box("시장 일보", "매일 12:00·24:00 집계 · PDF·HWPX", r
    ? h("div", { class: "cx-line" }, h("span", null, `${reportTitle(r)} 일보`), reportButtons(r))
    : h("p", { class: "note" }, "아직 생성된 일보가 없습니다."));
}

// ---- 주요코인 시세 ----
function coins() {
  const cs = data.coins;
  if (!cs || !(cs.coins || []).length) return [message("주요코인 시세를 불러오지 못했습니다. 다음 집계 후 새로고침해 주세요.")];
  if (!cs.coins.some((c) => c.symbol === S.coin)) S.coin = cs.coins[0].symbol;
  const host = h("div", { class: "stack" });
  const redraw = () => { host.replaceChildren(...coinBody()); };
  function coinBody() {
    const cur = cs.coins.find((c) => c.symbol === S.coin);
    const r = (S.year ? cur.year : cur.day) || {};
    const color = (r.change_rate ?? 0) >= 0 ? C.up : C.down;
    const labels = (r.points || []).map((_, i) => axisLabel((r.times || [])[i], S.year));
    return [
      h("div", { class: "chip-row wrap" }, cs.coins.map((c) => h("button", { type: "button", class: "pill" + (c.symbol === S.coin ? " on" : ""), onclick: () => { S.coin = c.symbol; redraw(); } }, c.symbol))),
      box(`${cur.name} (${cur.symbol})`, `현재가 ${formatPrice(cur.price)} 원`,
        h("div", { class: "chip-row wrap" }, [["당일", false], ["1년", true]].map(([t, y]) => h("button", { type: "button", class: "pill" + (S.year === y ? " on" : ""), onclick: () => { S.year = y; redraw(); } }, t))),
        h("div", { class: "cx-kpis three" }, kpi(S.year ? "1년 변동" : "당일 변동", formatPct(r.change_rate, 2, true), "", sign(r.change_rate)), kpi("고가", formatPrice(r.high)), kpi("저가", formatPrice(r.low))),
        el(lineChartSvg([{ name: S.year ? "1년" : "당일", color, values: r.points || [] }], labels, { height: 220, format: formatPrice, empty: "그래프 데이터가 없습니다" })),
        h("p", { class: "note" }, S.year ? "주봉 종가 기준 최근 1년. 변동률은 1년 전 첫 주 시가 대비 현재가." : "30분봉 종가 기준 최근 24시간. 변동률은 24시간 전 시가 대비 현재가.")),
      box("전체 비교", "원화 가격과 변동률", table(["코인", "현재가", "당일", "1년"], cs.coins.map((c) => [c.symbol, formatPrice(c.price), chgCell(c.day?.change_rate), chgCell(c.year?.change_rate, 1)]))),
    ];
  }
  redraw();
  return [h("p", { class: "note" }, `업비트 원화마켓 · ${cs.date} ${cs.slot_label || ""} 집계 · 수집 ${cs.collected_at || "-"}`), host];
}

// ---- 거래소별 현황 ----
function exchange() {
  const host = h("div", { class: "stack" });
  const redraw = () => host.replaceChildren(...exBody());
  function exBody() {
    const s = data.snapshot, sel = S.exchange, sum = (s.exchanges || []).find((e) => e.exchange === sel);
    const days = data.history.slice(-30).map((x) => x.exchanges?.[sel] ? [shortSlotDate(x.date, x.slot), x.exchanges[sel]] : null).filter(Boolean);
    const today = days.at(-1)?.[1], prev = days.at(-2)?.[1];
    const out = [h("div", { class: "chip-row wrap" }, EXCHANGE_ORDER.map((ex) => h("button", { type: "button", class: "pill" + (ex === sel ? " on" : ""), onclick: () => { S.exchange = ex; redraw(); } }, EXCHANGE_NAMES[ex])))];
    if (!sum || !sum.ok) out.push(h("p", { class: "note err" }, `${EXCHANGE_NAMES[sel]} 데이터를 이번 집계에서 수집하지 못했습니다.`));
    const mChg = today && prev ? today.markets - prev.markets : null, vChg = ratio(today?.value, prev?.value);
    out.push(kpiRow(
      kpi("상장 종목 수(원화)", `${sum?.markets ?? today?.markets ?? "-"}개`, mChg != null ? `전일 대비 ${mChg > 0 ? "+" : ""}${mChg}` : "", sign(mChg)),
      kpi("24h 거래대금", formatWon(sum?.value_24h ?? today?.value) + " 원", vChg != null ? "전일 대비 " + formatPct(vChg, 1, true) : "", sign(vChg)),
      kpi("국내 점유율", pct(sum?.share)), kpi("BTC 도미넌스(거래대금)", pct(sum?.btc_dominance))));
    const prices = today?.prices || {};
    out.push(box("주요 코인 가격", "원화, 집계 시각 기준 · 직전 집계 대비", Object.keys(prices).length
      ? table(["코인", "가격(원)", "전일 대비"], MAJORS.filter((m) => m in prices).map((m) => [m, formatPrice(prices[m]), chgCell(ratio(prices[m], prev?.prices?.[m]))]))
      : h("p", { class: "note" }, "가격 기록이 아직 없습니다.")));
    const labels = days.map((d) => d[0]);
    out.push(h("div", { class: "grid2" },
      box("거래대금 추이", `최근 ${days.length}회 집계`, el(barChartSvg(days.map((d) => d[1].value), labels, C.primary))),
      box("상장 종목 수 추이", "원화마켓", el(lineChartSvg([{ name: "종목 수", color: C.primary, values: days.map((d) => d[1].markets) }], labels, { format: (v) => formatNumber(v) })))));
    out.push(h("div", { class: "grid2" },
      box("BTC 가격 추이", "원화", el(lineChartSvg([{ name: "BTC", color: C.primary, values: days.map((d) => d[1].prices?.BTC ?? null) }], labels, { format: formatWon }))),
      box("신규 상장·상장 폐지", "이번 집계 목록과 최근 집계 건수", (() => {
        const l = s.listings?.[sel] || {};
        return h("div", { class: "stack" },
          h("div", { class: "up" }, "이번 집계 상장: " + ((l.listed || []).join(", ") || "없음")),
          h("div", { class: "down" }, "이번 집계 폐지: " + ((l.delisted || []).join(", ") || "없음")),
          h("small", { class: "note" }, `최근 ${days.length}회 집계 합계: 상장 ${days.reduce((a, d) => a + (d[1].listed || 0), 0)}건 · 폐지 ${days.reduce((a, d) => a + (d[1].delisted || 0), 0)}건`));
      })())));
    return out;
  }
  redraw();
  return [host];
}

// ---- 해외 시장 비교 ----
function globalView() {
  const s = data.snapshot, g = s.global || {}, d = s.domestic || {}, prev = data.previous, hist = data.history.slice(-30);
  const labels = hist.map((x) => shortSlotDate(x.date, x.slot));
  const cMcap = ratio(g.total_mcap_usd, prev?.total_mcap_usd), cKim = diffOf(g.kimchi_premium, prev?.kimchi_premium);
  return [
    kpiRow(
      kpi("글로벌 시가총액", formatUsdTrillion(g.total_mcap_usd), cMcap != null ? "전일 대비 " + formatPct(cMcap, 1, true) : "", sign(cMcap)),
      kpi("BTC 시가총액", formatUsdTrillion(g.btc_mcap_usd), `비중 ${pct(g.btc_dom_mcap)}`),
      kpi("글로벌 24h 거래대금", formatUsdTrillion(g.total_volume_usd)),
      kpi("BTC 가격(Coinbase)", g.btc_price_usd != null ? "$" + formatNumber(g.btc_price_usd) : "-", g.usdkrw != null ? `원/달러 ${formatNumber(g.usdkrw, 1)} (${g.fx_source || "-"})` : ""),
      kpi("김치 프리미엄", formatPct(g.kimchi_premium, 1, true), cKim != null ? "전일 대비 " + formatPp(cKim) : "", sign(cKim)),
      kpi("국내 거래대금 / 글로벌", g.total_volume_usd && g.usdkrw ? formatPct(d.total_value_24h / (g.total_volume_usd * g.usdkrw), 2) : "-", "원화 5개 거래소 ÷ 전체(환율 환산)")),
    box("BTC 도미넌스 추이", "국내(거래대금) vs 글로벌(거래대금·시가총액)", el(lineChartSvg([
      { name: "글로벌 시총", color: C.global, values: hist.map((x) => x.btc_dom_global_mcap ?? null) },
      { name: "글로벌 거래대금", color: "#7c5cff99", values: hist.map((x) => x.btc_dom_global_volume ?? null), dashed: true },
      { name: "국내 거래대금", color: C.primary, values: hist.map((x) => x.btc_dominance_kr ?? null) },
    ], labels, { height: 200, format: (v) => formatPct(v) }))),
    box("김치 프리미엄 추이", "", el(lineChartSvg([{ name: "김프", color: C.up, values: hist.map((x) => x.kimchi_premium ?? null) }], labels, { format: (v) => formatPct(v, 1, true) }))),
  ];
}

// ---- 시장 일보 ----
function report() {
  const rows = data.reports;
  return [
    box("국내 가상자산 시장 일보", "매일 12:00·24:00 KST 집계, A4 2쪽 · PDF·HWPX",
      h("p", null, "BTC 가격·김치 프리미엄·시가총액·거래금액 요약, 거래소별 현황, BTC 도미넌스 국내 vs 글로벌, 거래대금 상위, 등락 상위, 신규 상장·상장 폐지를 담습니다. HWPX는 한글에서 열어 편집할 수 있습니다.")),
    rows.length ? h("div", { class: "card" }, h("div", { class: "card-b stack" }, rows.map((r) => h("div", { class: "cx-line" }, h("span", null, `${reportTitle(r)} 일보`), reportButtons(r)))))
      : h("p", { class: "note" }, "아직 생성된 일보가 없습니다."),
  ];
}

