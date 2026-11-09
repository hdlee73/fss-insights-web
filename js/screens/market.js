// 금융시장 동향: 증시동향(지수·환율·금리·원자재), 관심종목, 국내 금융 통계(한국은행), 자본시장 통계(금융투자협회).
// 앱의 MarketScreen.kt를 옮겼다. 화면이 열려 있는 동안 지수는 10초, 전체는 20초마다 새로 읽는다.
import { setHeader } from "../app.js";
import { dialog, errorText, forget, h, icon, iconButton, store, toast } from "../core.js";
import {
  INDEX_CHOICES, KOREA_INDEXES, DEFAULT_WATCH, STAT_CATALOG, changeOf, deltaText, groupOf, history, indexSelection, intraday, investors,
  loadKofia, loadStats, periodLabel, priceText, quote, saveIndexSelection, saveStatSelection, search, sparkline, statDelta, statSelection, statText, tint,
  UP, DOWN,
} from "../lib/market.js";

const watchList = () => store.get("market.watch", DEFAULT_WATCH);
const saveWatch = (l) => store.set("market.watch", l);

/** 지수 칸 하나(넓은 칸은 코스피·코스닥: 투자자별 순매수 포함). 반환한 update()로 값만 바꾼다. */
export function indexTile(it, { wide = false, intradayMode = true, showInvestors = false } = {}) {
  const nm = h("div", { class: "nm" }, it.name);
  const px = h("div", { class: "px" }, "—");
  const dl = h("div", { class: "dl" }, "전일 대비 —");
  const chart = h("div", { class: "ch" });
  const inv = showInvestors ? h("div", { class: "inv" }) : null;
  const el = wide
    ? h("div", { class: "tile" }, h("div", { class: "tt" }, h("div", null, nm, px), chart), dl, inv)
    : h("div", { class: "tile" }, nm, px, dl, chart);
  async function update() {
    let q;
    try {
      q = await quote(it.symbol);
    } catch {
      dl.textContent = "시세 없음";
      return false;
    }
    if (!el.isConnected) return true;
    const ch = changeOf(q);
    px.textContent = priceText(it, q.price);
    dl.textContent = deltaText(it, q) || "전일 대비 —";
    dl.style.color = tint(ch);
    const color = ch > 0 ? UP : ch < 0 ? DOWN : "var(--muted)";
    try {
      if (intradayMode) {
        const d = await intraday(it.symbol, q.previous, q.price);
        // 앱처럼 전 거래일 흐름(회색)을 왼쪽에, 오늘 흐름을 오른쪽에 함께 그린다.
        chart.replaceChildren(sparkline(d.points, { height: 30, color, baseline: d.previous, prev: d.prevPoints, open: d.open, bars: d.live ? d.bars : 0 }));
        nm.replaceChildren(it.name, d.status ? h("span", { class: "stag" + (d.status === "장중" ? " live" : "") }, d.status) : "");
      } else {
        const hh = await history(it.symbol);
        // 색은 숫자(전일 대비)와 같게 맞춘다. 1년 첫날 대비로 칠하면 오늘 하락인데 빨간 선이 될 수 있다.
        chart.replaceChildren(sparkline(hh.closes, { height: 30, color }));
        nm.replaceChildren(it.name);
      }
    } catch {
      chart.replaceChildren();
    }
    if (inv) {
      try {
        const f = await investors(it.symbol);
        const cell = (label, v) => h("div", null, label, h("b", { style: { color: tint(v) } }, Number.isFinite(v) ? (v > 0 ? "+" : "") + Math.round(v).toLocaleString("ko-KR") : "—"));
        inv.replaceChildren(h("small", null, "투자자별 순매수(억원)"), h("div", { class: "r" }, cell("개인", f.personal), cell("외국인", f.foreign), cell("기관계", f.institutional)));
      } catch {
        inv.replaceChildren();
      }
    }
    return true;
  }
  return { el, update };
}

function subhead(title, ...actions) {
  return h("div", { class: "subhead" }, h("h2", null, title), ...actions);
}
const soft = (label, onclick, on = false) => h("button", { class: "pill sm" + (on ? " on" : ""), type: "button", onclick }, label);

export async function render(root, params, ctx) {
  const refreshBtn = iconButton("refresh-cw", "시세 새로고침", () => {
    forget("q:");
    forget("i:");
    forget("stats:");
    forget("kofia");
    ctx.go({}, { replace: true });
  });
  setHeader("금융시장 동향", "지수·환율·금리·원자재를 한눈에", [refreshBtn]);

  // ---- 증시동향 ----
  const indexMode = store.get("market.indexIntraday", true);
  root.append(subhead("증시동향",
    soft(indexMode ? "그래프: 당일" : "그래프: 1년", () => (store.set("market.indexIntraday", !indexMode), ctx.go({}, { replace: true }))),
    soft("지표 선택", async () => {
      if (await pickIndexes()) ctx.go({}, { replace: true });
    })));
  const sel = indexSelection();
  const chosen = INDEX_CHOICES.filter((x) => sel.market.includes(x.symbol));
  const wide = chosen.filter((x) => KOREA_INDEXES.some((k) => k.symbol === x.symbol));
  const small = chosen.filter((x) => !wide.includes(x));
  const tiles = [];
  if (!chosen.length) root.append(h("p", { class: "note card" }, "표시할 지표가 없습니다. ‘지표 선택’에서 고르세요."));
  if (wide.length) {
    const row = h("div", { class: "tiles wide2" });
    for (const it of wide) {
      const t = indexTile(it, { wide: true, intradayMode: indexMode, showInvestors: true });
      tiles.push(t);
      row.append(t.el);
    }
    root.append(row);
  }
  if (small.length) {
    const row = h("div", { class: "tiles" });
    for (const it of small) {
      const t = indexTile(it, { intradayMode: indexMode });
      tiles.push(t);
      row.append(t.el);
    }
    root.append(row);
  }
  root.append(h("p", { class: "note", style: { marginTop: "6px" } }, "해외 지수·환율은 지연될 수 있음 · 그래프는 " + (indexMode ? "당일(장 마감 후엔 직전 거래일) 흐름" : "최근 1년 추이")));

  // ---- 관심종목 ----
  const watchMode = store.get("market.watchIntraday", true);
  const editing = params.edit === "1";
  const watch = watchList();
  root.append(subhead(`관심종목 ${watch.length}`,
    soft(watchMode ? "그래프: 당일" : "그래프: 1년", () => (store.set("market.watchIntraday", !watchMode), ctx.go(params, { replace: true }))),
    soft(editing ? "완료" : "편집", () => ctx.go({ edit: editing ? null : "1" }, { replace: true }), editing),
    soft("+ 종목", async () => {
      const it = await addInstrument(watch.map((w) => w.symbol));
      if (it) (saveWatch([...watchList(), it]), ctx.go(params, { replace: true }));
    })));
  const grid = h("div", { class: "watch" });
  const cells = [];
  if (!watch.length) root.append(h("p", { class: "note card" }, "표시할 종목을 추가해 주세요."));
  else root.append(grid);
  watch.forEach((it, i) => {
    const nm = h("div", { class: "nm" }, it.name);
    const px = h("div", { class: "px" }, "—");
    const dl = h("div", { class: "dl" }, "—");
    const chart = h("div");
    const cell = h("div", { class: "wc" }, nm, px, dl, chart,
      editing ? h("div", { class: "ed" },
        i > 0 ? iconButton("arrow-up", "앞으로", () => {
          const l = watchList();
          l.splice(i - 1, 0, l.splice(i, 1)[0]);
          saveWatch(l);
          ctx.go(params, { replace: true });
        }) : null,
        iconButton("trash-2", "삭제", async () => {
          if (await dialog({ title: "관심종목 삭제", text: `${it.name}을(를) 관심종목에서 삭제할까요?`, ok: "삭제", danger: true })) {
            saveWatch(watchList().filter((w) => w.symbol !== it.symbol));
            ctx.go(params, { replace: true });
          }
        })) : null);
    grid.append(cell);
    cells.push(async () => {
      try {
        const q = await quote(it.symbol);
        const ch = changeOf(q);
        px.textContent = priceText(it, q.price);
        dl.textContent = deltaText(it, q) || "—";
        dl.style.color = tint(ch);
        const color = ch > 0 ? UP : ch < 0 ? DOWN : "var(--muted)";
        if (watchMode) {
          const d = await intraday(it.symbol, q.previous, q.price);
          chart.replaceChildren(sparkline(d.points, { height: 26, color, baseline: d.previous, bars: d.live ? d.bars : 0 }));
        } else {
          const hh = await history(it.symbol);
          chart.replaceChildren(sparkline(hh.closes, { height: 26, color }));
        }
      } catch {
        if (px.textContent === "—") dl.textContent = "시세 없음";
      }
    });
  });

  // ---- 국내 금융 통계 ----
  const stats = h("div");
  root.append(subhead("국내 금융 통계", soft("통계 선택", async () => {
    if (await pickStats()) ctx.go(params, { replace: true });
  })), stats, h("p", { class: "note", style: { marginTop: "6px" } }, "한국은행 ECOS 기준. 기준금리는 직전 변경 대비, 나머지는 직전 관측값 대비."));
  drawStats(stats, statSelection().market);

  // ---- 자본시장 통계 ----
  const kofia = h("div", { class: "kofia-cols" });
  root.append(subhead("자본시장 통계", soft("항목 선택", async () => {
    if (await pickKofia()) ctx.go(params, { replace: true });
  })), kofia, h("p", { class: "note", style: { marginTop: "6px" } }, "금융투자협회 종합통계 포털 기준. 직전 영업일(신규펀드는 직전 조회일) 대비 증감."));
  drawKofia(kofia);

  root.append(h("p", { class: "note", style: { margin: "18px 0 4px" } }, "공개 시세 기반이라 지연되거나 중단될 수 있습니다. 국내는 NAVER, 해외·환율은 Yahoo Finance."));

  // 첫 표시 뒤 주기적으로 새로 읽는다(화면을 떠나면 멈춘다).
  const all = () => Promise.all([...tiles.map((t) => t.update()), ...cells.map((f) => f())]);
  await all();
  let tick = 0;
  const timer = setInterval(() => {
    if (!ctx.alive()) return clearInterval(timer);
    if (document.hidden) return;
    tick++;
    forget("q:");
    if (tick % 2 === 0) {
      forget("i:");
      all();
    } else tiles.forEach((t) => t.update());
  }, 10_000);
}

export async function drawStats(box, ids, { compact = false } = {}) {
  box.replaceChildren(h("div", { class: "note card" }, "통계를 불러오는 중입니다…"));
  if (!ids.length) return box.replaceChildren(h("p", { class: "note card" }, "표시할 통계가 없습니다. ‘통계 선택’에서 고르세요."));
  let r;
  try {
    r = await loadStats(STAT_CATALOG.map((s) => s.id).filter((id) => ids.includes(id)));
  } catch (e) {
    return box.replaceChildren(h("p", { class: "note card", style: { color: "var(--danger)" } }, "통계를 서버에서 받지 못했습니다. " + errorText(e)));
  }
  const visible = STAT_CATALOG.map((d) => r.items.find((x) => x.id === d.id)).filter(Boolean);
  const absent = STAT_CATALOG.filter((d) => ids.includes(d.id) && !r.items.some((x) => x.id === d.id));
  const groups = new Map();
  for (const it of visible) {
    const g = groupOf(it.id);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  const cell = (it) => {
    const ch = it.previous != null ? it.value - it.previous : null;
    return h("div", { class: "sc" }, h("div", { class: "nm" }, it.name), h("div", { class: "pd" }, periodLabel(it.period) + " 기준"),
      h("b", null, statText(it, it.value)), h("div", { class: "dl", style: { color: tint(ch) } }, statDelta(it) || "직전 값 —"));
  };
  box.replaceChildren(...[
    visible.length ? h("div", { class: "stats" }, [...groups].map(([g, rows]) => [compact ? null : h("div", { class: "g" }, g), h("div", { class: "cells" }, rows.map(cell))])) : h("p", { class: "note card" }, "통계를 서버에서 받지 못했습니다."),
    absent.length && visible.length ? h("p", { class: "note", style: { color: "var(--danger)", marginTop: "6px" } }, "받지 못한 통계: " + absent.map((d) => d.name + (r.reasons[d.id] ? ` [${r.reasons[d.id]}]` : "")).join("; ")) : null].filter(Boolean));
}

async function drawKofia(box) {
  box.replaceChildren(h("div", { class: "note card" }, "자본시장 통계를 불러오는 중입니다…"));
  let all;
  try {
    all = await loadKofia();
  } catch (e) {
    return box.replaceChildren(h("p", { class: "note card" }, "자본시장 통계를 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요."));
  }
  const hidden = new Set(store.get("market.kofiaHidden", []));
  const groups = all.map((g) => ({ ...g, sections: g.sections.map((s) => ({ ...s, items: s.items.filter((i) => !hidden.has(i.key)) })).filter((s) => s.items.length) })).filter((g) => g.sections.length);
  if (!groups.length) return box.replaceChildren(h("p", { class: "note card" }, "표시할 항목이 없습니다. ‘항목 선택’에서 고르세요."));
  box.replaceChildren(...groups.map((g) => h("div", { class: "stats kofia" }, h("div", { class: "g" }, g.title),
    g.sections.map((s) => [
      h("div", { class: "sh" }, h("span", null, s.title + (s.asOf ? ` (${s.asOf})` : "")), h("span", { class: "note" }, s.unit)),
      s.items.map((i) => h("div", { class: "row" }, h("span", null, i.name), h("div", null, h("b", null, i.value),
        h("div", { class: "dl", style: { color: tint(i.change) } }, i.change != null ? (i.change > 0 ? "▲" : i.change < 0 ? "▼" : "") + Math.abs(i.change).toLocaleString("ko-KR", { maximumFractionDigits: 0 }) : i.changeText)))),
    ]))));
}

/** 두 칸(시장동향 / 브리핑) 체크 목록. rows: [{key, label, group}] */
function pickTable(rows, a, b, labels = ["시장동향", "브리핑"]) {
  const box = h("div", { class: "pick-list" });
  let lastGroup = null;
  const inputs = [];
  for (const r of rows) {
    if (r.group && r.group !== lastGroup) {
      lastGroup = r.group;
      box.append(h("div", { class: "ph" }, h("span", { style: { flex: 1 } }, r.group), h("span", { class: "pc" }, labels[0]), b ? h("span", { class: "pc" }, labels[1]) : null));
    }
    const ca = h("input", { type: "checkbox" });
    ca.checked = a.has(r.key);
    const cb = b ? h("input", { type: "checkbox" }) : null;
    if (cb) cb.checked = b.has(r.key);
    inputs.push([r.key, ca, cb]);
    box.append(h("label", { class: "pr" }, h("span", null, r.label), h("span", { class: "pc" }, ca), b ? h("span", { class: "pc" }, cb) : null));
  }
  return { box, read: () => ({ a: inputs.filter(([, x]) => x.checked).map(([k]) => k), b: inputs.filter(([, , y]) => y?.checked).map(([k]) => k) }) };
}

async function pickIndexes() {
  const sel = indexSelection();
  const groupOfIndex = (s) => (KOREA_INDEXES.some((k) => k.symbol === s) ? "국내" : /=X|DX-Y/.test(s) ? "환율" : /\^(TNX|FVX|TYX)/.test(s) ? "금리" : /=F|-USD/.test(s) ? "원자재·코인" : "해외 지수");
  const order = ["국내", "해외 지수", "환율", "금리", "원자재·코인"];
  const rows = [...INDEX_CHOICES].sort((x, y) => order.indexOf(groupOfIndex(x.symbol)) - order.indexOf(groupOfIndex(y.symbol))).map((x) => ({ key: x.symbol, label: x.name, group: groupOfIndex(x.symbol) }));
  const t = pickTable(rows, new Set(sel.market), new Set(sel.briefing));
  if (!(await dialog({ title: "지표 선택", body: [h("div", { class: "note" }, "금융시장 동향과 오늘의 브리핑에 보일 지표를 고릅니다."), t.box], ok: "저장", wide: true }))) return false;
  const r = t.read();
  saveIndexSelection({ market: r.a, briefing: r.b });
  return true;
}

async function pickStats() {
  const sel = statSelection();
  const t = pickTable(STAT_CATALOG.map((s) => ({ key: s.id, label: s.name, group: s.group })), new Set(sel.market), new Set(sel.briefing));
  if (!(await dialog({ title: "통계 선택", body: [h("div", { class: "note" }, "금융시장 동향과 오늘의 브리핑에 보일 통계를 고릅니다."), t.box], ok: "저장", wide: true }))) return false;
  const r = t.read();
  saveStatSelection({ market: r.a, briefing: r.b });
  return true;
}

async function pickKofia() {
  let all;
  try {
    all = await loadKofia();
  } catch {
    toast("자본시장 통계를 아직 받지 못했습니다.");
    return false;
  }
  const hidden = new Set(store.get("market.kofiaHidden", []));
  const rows = all.flatMap((g) => g.sections.flatMap((s) => s.items.map((i) => ({ key: i.key, label: i.name, group: `${g.title} · ${s.title}` }))));
  const t = pickTable(rows, new Set(rows.map((r) => r.key).filter((k) => !hidden.has(k))), null, ["표시"]);
  if (!(await dialog({ title: "표시할 항목 선택", body: t.box, ok: "저장", wide: true }))) return false;
  const shown = new Set(t.read().a);
  store.set("market.kofiaHidden", rows.map((r) => r.key).filter((k) => !shown.has(k)));
  return true;
}

/** 종목 검색 창. 고른 종목 또는 null. */
function addInstrument(owned) {
  return new Promise((resolve) => {
    let picked = null;
    const input = h("input", { type: "search", placeholder: "이름 또는 코드 (예: 삼성전자, AAPL, QQQ)" });
    const list = h("div", { class: "pick-list", style: { minHeight: "120px" } });
    const run = async () => {
      const q = input.value.trim();
      if (!q) return;
      list.replaceChildren(h("div", { class: "pr note" }, "검색 중…"));
      try {
        const items = (await search(q)).filter((x) => !owned.includes(x.symbol));
        list.replaceChildren(...(items.length ? items.slice(0, 30).map((x) => h("button", { type: "button", class: "pr", style: { width: "100%", border: 0, background: "none", textAlign: "left", cursor: "pointer", font: "inherit" }, onclick: () => {
          picked = x;
          document.querySelector(".modal-back form")?.requestSubmit();
        } }, h("span", null, x.name), h("span", { class: "note" }, `${x.symbol} · ${x.type}`))) : [h("div", { class: "pr note" }, "검색 결과가 없습니다.")]));
      } catch (e) {
        list.replaceChildren(h("div", { class: "pr note", style: { color: "var(--danger)" } }, errorText(e)));
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") (e.preventDefault(), run());
    });
    dialog({
      title: "관심종목 추가",
      body: [h("div", { class: "search" }, icon("search"), input, h("button", { class: "btn sm", type: "button", onclick: run }, "검색")), list, h("div", { class: "note" }, "국내 주식·ETF는 NAVER, 해외는 Yahoo Finance에서 찾습니다.")],
      ok: "닫기",
      cancel: null,
    }).then(() => {
      if (picked) toast(`${picked.name}을(를) 담았습니다.`);
      resolve(picked);
    });
    setTimeout(() => input.focus(), 30);
  });
}
