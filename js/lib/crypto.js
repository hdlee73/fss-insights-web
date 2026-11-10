// 가상자산 시장 동향: 자료 읽기, 숫자 서식, 이전 집계 찾기, 간단한 SVG 그래프.
// 자료는 VirtualAssets 레포의 일보 수집기(매일 12:00·24:00 KST)가 gh-pages에 올리는 JSON이며, 서버 키가 필요 없다.
export const DATA_BASE = "https://hdlee73.github.io/VirtualAssets";

export const EXCHANGE_ORDER = ["upbit", "bithumb", "coinone", "korbit", "gopax"];
export const EXCHANGE_NAMES = { upbit: "업비트", bithumb: "빗썸", coinone: "코인원", korbit: "코빗", gopax: "고팍스" };

export const absoluteUrl = (path) => `${DATA_BASE}/${String(path).replace(/^\/+/, "")}`;

async function getJson(path) {
  let res;
  try {
    res = await fetch(absoluteUrl(path), { cache: "no-cache" });
  } catch {
    throw new Error("네트워크에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
  }
  if (res.status === 404) throw new Error("아직 데이터가 없습니다(404). 첫 일보가 생성된 뒤 다시 확인해 주세요.");
  if (!res.ok) throw new Error(`서버 응답 오류(${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new Error("데이터 형식을 읽지 못했습니다.");
  }
}

/** 최신 집계 + 이력 + 일보 목록 + 주요코인. 이력·일보·코인은 실패해도 빈 값으로 둔다. */
export async function loadMarket() {
  const [snapshot, history, reports, coins] = await Promise.all([
    getJson("data/latest.json"),
    getJson("data/history.json").catch(() => []),
    getJson("reports/index.json").catch(() => []),
    getJson("data/coins.json").catch(() => null),
  ]);
  const hist = Array.isArray(history) ? history : [];
  const date = snapshot.date || String(snapshot.as_of || "").slice(0, 10);
  return { snapshot, history: hist, reports: Array.isArray(reports) ? reports : [], coins, previous: findPrevious(hist, date, snapshot.slot || "") };
}

const slotRank = (s) => (s === "1200" ? 1 : s === "2400" ? 2 : 0);
/** 이번 집계 직전 기록(전일 대비용). 전날 같은 시각이 있으면 그것을, 없으면 직전 집계를 쓴다. */
export function findPrevious(history, date, slot) {
  const earlier = history.filter((x) => x.date < date || (x.date === date && slotRank(x.slot || "") < slotRank(slot)));
  const sameSlot = earlier.filter((x) => (x.slot || "") === slot && x.date < date);
  const max = (arr) => arr.reduce((a, b) => (!a || b.date > a.date || (b.date === a.date && slotRank(b.slot) > slotRank(a.slot)) ? b : a), null);
  return max(sameSlot) || max(earlier);
}

export const whenText = (s) => (s.date || String(s.as_of || "").slice(0, 10)) + " " + (s.slot_label || "09:00");
export const nextSlotText = (s) => (s.slot === "1200" ? "오늘 24:00" : "12:00");
export const reportTitle = (r) => (r.slot_label ? `${r.date} ${r.slot_label}` : r.date);

// ---- 숫자 서식 (앱 Format.kt와 같은 결과) ----
export function formatNumber(v, decimals = 0) {
  if (v == null || !Number.isFinite(v)) return "-";
  const f = 10 ** decimals;
  const total = Math.round(Math.abs(v) * f);
  const int = Math.floor(total / f);
  const intStr = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = v < 0 && total !== 0 ? "-" : "";
  if (!decimals) return sign + intStr;
  return `${sign}${intStr}.${String(total % f).padStart(decimals, "0")}`;
}
export function formatWon(v) {
  if (v == null) return "-";
  if (Math.abs(v) >= 1e12) return formatNumber(v / 1e12, 2) + "조";
  if (Math.abs(v) >= 1e8) return formatNumber(v / 1e8, 0) + "억";
  return formatNumber(v, 0);
}
export function formatPrice(v) {
  if (v == null) return "-";
  return v >= 100 ? formatNumber(v, 0) : v >= 1 ? formatNumber(v, 2) : formatNumber(v, 4);
}
export function formatPct(r, decimals = 1, signed = false) {
  if (r == null) return "-";
  const s = formatNumber(r * 100, decimals) + "%";
  return signed && r * 100 >= 0.5 / 10 ** decimals ? "+" + s : s;
}
export function formatPp(d) {
  if (d == null) return "-";
  const s = formatNumber(d * 100, 1) + "%p";
  return d * 100 >= 0.05 ? "+" + s : s;
}
export const formatUsdTrillion = (v) => (v == null ? "-" : "$" + formatNumber(v / 1e12, 2) + "T");
export const shortDate = (d) => (d && d.length >= 10 ? d.slice(5, 10).replace("-", "/") : d || "");
export const shortSlotDate = (d, slot) => shortDate(d) + (slot === "1200" ? " 12시" : slot === "2400" ? " 24시" : "");
export const ratio = (cur, prev) => (cur == null || prev == null || prev === 0 ? null : cur / prev - 1);
export const diffOf = (cur, prev) => (cur == null || prev == null ? null : cur - prev);
export const sign = (v) => (v == null || v === 0 ? 0 : v > 0 ? 1 : -1);

// ---- SVG 그래프 (색은 CSS 변수) ----
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// 그래프 폭은 그릴 때의 화면 폭에 맞춘다(휴대폰에서도 글자가 작아지지 않게).
const chartW = () => {
  const cw = document.getElementById("content")?.clientWidth || 700;
  return cw > 760 ? 560 : Math.max(300, cw - 60);
};

/** series: [{name, color, values, dashed}] — null 값은 건너뛴다. */
export function lineChartSvg(series, xLabels, { height = 180, format = (v) => formatNumber(v), empty = "데이터가 없습니다" } = {}) {
  const vals = series.flatMap((s) => s.values).filter((v) => v != null && Number.isFinite(v));
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (vals.length < 2 || n < 2) return `<div class="cx-empty">${esc(empty)}</div>`;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi += Math.abs(hi) * 0.01 || 1; lo -= Math.abs(lo) * 0.01 || 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const W = chartW(), T = 10, B = height - 22, R = W - 8;
  const L = 14 + 6.4 * Math.max(...[lo, hi].map((v) => format(v).length));
  const x = (i) => L + ((R - L) * i) / (n - 1);
  const y = (v) => B - ((B - T) * (v - lo)) / (hi - lo);
  let g = "";
  for (let k = 0; k <= 3; k++) {
    const v = lo + ((hi - lo) * k) / 3, gy = y(v).toFixed(1);
    g += `<line x1="${L}" x2="${R}" y1="${gy}" y2="${gy}" class="cx-grid"/><text x="${L - 6}" y="${+gy + 4}" text-anchor="end" class="cx-t">${esc(format(v))}</text>`;
  }
  const ticks = n <= 6 ? [...Array(n).keys()] : [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
  for (const i of ticks) if (xLabels[i]) g += `<text x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" class="cx-t">${esc(xLabels[i])}</text>`;
  for (const s of series) {
    let d = "", pen = false;
    s.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) return void (pen = false);
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="5 4"' : ""}/>`;
  }
  const legend = series.length > 1 ? `<div class="cx-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  return `<svg viewBox="0 0 ${W} ${height}" class="cx-svg" role="img" preserveAspectRatio="xMidYMid meet">${g}</svg>${legend}`;
}

export function barChartSvg(values, labels, color, { height = 170, empty = "데이터가 없습니다" } = {}) {
  const n = values.length;
  if (!n || Math.max(...values) <= 0) return `<div class="cx-empty">${esc(empty)}</div>`;
  const W = chartW(), hi = Math.max(...values), L = 8, R = W - 8, T = 8, B = height - 22, bw = (R - L) / n;
  let g = "";
  values.forEach((v, i) => {
    const hgt = ((B - T) * v) / hi;
    const w = Math.min(bw * 0.7, 36);
    g += `<rect x="${(L + bw * (i + 0.5) - w / 2).toFixed(1)}" y="${(B - hgt).toFixed(1)}" width="${w.toFixed(1)}" height="${hgt.toFixed(1)}" rx="2" fill="${color}"><title>${esc(labels[i])} ${esc(formatWon(v))}</title></rect>`;
  });
  const ticks = n <= 6 ? [...Array(n).keys()] : [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
  for (const i of ticks) g += `<text x="${(L + bw * (i + 0.5)).toFixed(1)}" y="${height - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" class="cx-t">${esc(labels[i])}</text>`;
  return `<svg viewBox="0 0 ${W} ${height}" class="cx-svg" role="img">${g}</svg>`;
}

export function donutSvg(slices) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return `<div class="cx-empty">데이터가 없습니다</div>`;
  let a0 = -Math.PI / 2, arcs = "";
  const r = 46, c = 60;
  for (const s of slices) {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const p = (a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    arcs += s.value / total > 0.9999
      ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="18"/>`
      : `<path d="M${p(a0)} A${r} ${r} 0 ${large} 1 ${p(a1)}" fill="none" stroke="${s.color}" stroke-width="18"/>`;
    a0 = a1;
  }
  const legend = slices.map((s) => `<div><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${esc(formatPct(s.value / total))}</b></div>`).join("");
  return `<div class="cx-donut"><svg viewBox="0 0 120 120" role="img">${arcs}</svg><div class="cx-dleg">${legend}</div></div>`;
}

export function hbarsHtml(items, max) {
  return `<div class="cx-hbars">${items.map(([label, v, color]) => `<div class="r"><span>${esc(label)}</span><div class="t"><div style="width:${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%;background:${color}"></div></div><b>${esc(formatPct(v))}</b></div>`).join("")}</div>`;
}

/** "2026-11-09T10:30" → 당일 "10:30", 1년 "26.11" */
export function axisLabel(t, yearView) {
  if (!t) return "";
  return yearView ? (t.length >= 7 ? t.slice(2, 7).replace("-", ".") : "") : t.length >= 16 ? t.slice(11, 16) : "";
}
