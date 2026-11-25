// 시총 히트맵의 순수 계산(화면·서버 호출 없음 → node 로 시험한다: tests/heatmap.test.mjs).
// ---- 순수 계산(시험 가능) ----

/** 시가총액(억원) → "1,027조" · "8,400억" 같은 글자. */
export function capText(eok) {
  if (!(eok > 0)) return "—";
  if (eok >= 10000) {
    const jo = eok / 10000;
    return (jo >= 100 ? Math.round(jo).toLocaleString("ko-KR") : jo.toLocaleString("ko-KR", { maximumFractionDigits: 1 })) + "조";
  }
  return Math.round(eok).toLocaleString("ko-KR") + "억";
}

export const pctText = (p) => (p > 0 ? "+" : "") + p.toFixed(2) + "%";

/** 등락률 → 칸 색(한국식: 상승 빨강·하락 파랑, ±3%에서 가장 진함, 거의 0이면 회색). */
export function tileColor(p) {
  if (!Number.isFinite(p) || Math.abs(p) < 0.05) return "rgb(133,144,166)";
  const a = Math.min(Math.abs(p), 3) / 3;
  const base = p > 0 ? [229, 72, 77] : [31, 111, 235];
  const gray = [96, 108, 130];
  return "rgb(" + base.map((v, i) => Math.round(gray[i] + (v - gray[i]) * (0.35 + 0.65 * a))).join(",") + ")";
}

/**
 * 정사각형에 가깝게 나누는 트리맵(squarified). items: [{v: 값, ...}] 값 큰 순. 반환: 각 항목에 x,y,w,h(픽셀)를 붙인 배열.
 * 값이 0 이하인 항목은 건너뛴다.
 */
export function squarify(items, W, H) {
  const list = items.filter((i) => i.v > 0);
  const total = list.reduce((s, i) => s + i.v, 0);
  if (!list.length || !(W > 0) || !(H > 0) || !(total > 0)) return [];
  const k = (W * H) / total;
  const nodes = list.map((i) => ({ ...i, a: i.v * k }));
  const out = [];
  let x = 0, y = 0, w = W, hh = H, i = 0;
  const worst = (row, side) => {
    const s = row.reduce((t, r) => t + r.a, 0);
    let mx = 0, mn = Infinity;
    for (const r of row) (mx = Math.max(mx, r.a)), (mn = Math.min(mn, r.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (i < nodes.length) {
    const side = Math.min(w, hh);
    const row = [nodes[i]];
    let j = i + 1;
    while (j < nodes.length && worst([...row, nodes[j]], side) <= worst(row, side)) row.push(nodes[j++]);
    const s = row.reduce((t, r) => t + r.a, 0);
    if (w >= hh) {
      const rw = s / hh;
      let yy = y;
      for (const r of row) (out.push({ ...r, x, y: yy, w: rw, h: r.a / rw }), (yy += r.a / rw));
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let xx = x;
      for (const r of row) (out.push({ ...r, x: xx, y, w: r.a / rh, h: rh }), (xx += r.a / rh));
      y += rh;
      hh -= rh;
    }
    i = j;
  }
  return out;
}

/** NAVER 시총 목록 페이지들 → 서버 /heatmap 과 같은 모양. rows: [종목코드, 종목명, 시가총액(억원), 등락률]. */
export function buildFromNaver(pages, market, now = Date.now()) {
  const rows = [];
  let time = "", status = "";
  for (const p of pages) {
    for (const s of p?.stocks || []) {
      if (s.stockEndType !== "stock") continue;
      const cap = Number(String(s.marketValueRaw ?? "").replace(/,/g, "")) / 1e8;
      const pct = Number(String(s.fluctuationsRatio ?? "").replace(/,/g, ""));
      if (!s.itemCode || !s.stockName || !(cap > 0) || !Number.isFinite(pct)) continue;
      rows.push([String(s.itemCode), String(s.stockName), Math.round(cap), pct]);
      if (s.localTradedAt && s.localTradedAt > time) time = s.localTradedAt;
    }
    if (p?.marketStatus) status = p.marketStatus;
  }
  rows.sort((a, b) => b[2] - a[2]);
  const seen = new Set();
  return { market, at: now, time, status, rows: rows.filter((r) => !seen.has(r[0]) && seen.add(r[0])).slice(0, 150) };
}

