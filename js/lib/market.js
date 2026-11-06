// 공개 시세 조회(키 없음): 국내 종목·지수는 NAVER, 해외·환율·원자재는 Yahoo Finance. 서버의 /fetch 중계를 거친다.
import { cached, fetchSite } from "../core.js";

const NAVER_REF = "https://m.stock.naver.com/";
const KR = /^[A-Z0-9]{6}\.(KS|KQ)$/;

export const isKorean = (sym) => KR.test(sym) || sym === "^KS11" || sym === "^KQ11";

async function json(url) {
  const { text } = await fetchSite(url, { referer: NAVER_REF });
  return JSON.parse(text);
}
const num = (t) => Number(String(t ?? "").replace(/,/g, "").trim());

function checked(raw) {
  const s = String(raw || "").toUpperCase();
  if (!/^[A-Z0-9^.=\-]{1,32}$/.test(s)) throw new Error("잘못된 종목 코드");
  return s;
}

function naverPath(sym) {
  if (sym === "^KS11") return "index/KOSPI";
  if (sym === "^KQ11") return "index/KOSDAQ";
  if (KR.test(sym)) return "item/" + sym.slice(0, 6);
  return null;
}

async function yahooChart(sym, range, interval = "1d") {
  let last;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const root = await json(`https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`);
      const r = root?.chart?.result?.[0];
      if (!r) throw new Error("해당 종목 시세가 없습니다");
      return r;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("시세 연결 실패");
}

async function naverQuote(url) {
  const o = await json(url);
  const price = num(o.closePrice);
  const code = o.compareToPreviousPrice?.code || "";
  let change = num(o.compareToPreviousClosePrice);
  if (code === "4" || code === "5") change = -Math.abs(change);
  else if (code === "1" || code === "2") change = Math.abs(change);
  else if (code === "3") change = 0;
  const previous = price - change;
  if (!(price > 0) || !(previous > 0)) throw new Error("가격 없음");
  return { price, previous, market: o.marketStatus || "", time: o.localTradedAt || "" };
}

async function yahooQuote(sym) {
  const chart = await yahooChart(sym, "5d");
  const meta = chart.meta || {};
  const price = meta.regularMarketPrice;
  if (!(price > 0)) throw new Error("유효한 가격 없음");
  let previous = sym.startsWith("^") || sym.endsWith("=X") ? NaN : meta.previousClose ?? NaN;
  if (!Number.isFinite(previous)) {
    // 지수·환율은 일봉에서 전일 종가를 찾는다(5일 전 기준이 되지 않도록).
    const tz = meta.exchangeTimezoneName || "America/New_York";
    const day = (t) => new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: tz });
    const latest = day(meta.regularMarketTime || 0);
    const ts = chart.timestamp || [];
    const closes = chart.indicators?.quote?.[0]?.close || [];
    ts.forEach((t, i) => {
      if (day(t) < latest && closes[i] > 0) previous = closes[i];
    });
  }
  return { price, previous: Number.isFinite(previous) ? previous : null, market: meta.exchangeName || "", time: "" };
}

/** 현재가와 전일 종가. */
export function quote(raw) {
  const sym = checked(raw);
  return cached("q:" + sym, 60_000, async () => {
    if (sym === "^KS11" || sym === "^KQ11") {
      return naverQuote(`https://m.stock.naver.com/api/index/${sym === "^KS11" ? "KOSPI" : "KOSDAQ"}/basic`).catch(() => yahooQuote(sym));
    }
    if (KR.test(sym)) return naverQuote(`https://m.stock.naver.com/api/stock/${sym.slice(0, 6)}/basic`).catch(() => yahooQuote(sym));
    return yahooQuote(sym);
  });
}

export const changeOf = (q) => (q?.previous > 0 ? q.price - q.previous : null);
export const percentOf = (q) => (q?.previous > 0 ? ((q.price - q.previous) / q.previous) * 100 : null);

async function naverHistory(code) {
  const { text } = await fetchSite(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=260&requestType=0`, { referer: NAVER_REF });
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cut = cutoff.toISOString().slice(0, 10).replace(/-/g, "");
  const closes = [];
  const dates = [];
  let high = -Infinity;
  let low = Infinity;
  for (const m of text.matchAll(/<item data="([^"]+)"/g)) {
    const v = m[1].split("|");
    if (v.length < 5 || v[0] < cut) continue;
    const c = num(v[4]);
    if (!(c > 0)) continue;
    high = Math.max(high, num(v[2]));
    low = Math.min(low, num(v[3]));
    closes.push(c);
    dates.push(v[0]);
  }
  if (closes.length < 2) throw new Error("차트 자료 없음");
  return { closes, dates, high, low };
}

async function yahooHistory(sym) {
  const chart = await yahooChart(sym, "1y");
  const q = chart.indicators?.quote?.[0] || {};
  const ts = chart.timestamp || [];
  const tz = chart.meta?.exchangeTimezoneName || "UTC";
  const closes = [];
  const dates = [];
  let high = -Infinity;
  let low = Infinity;
  (q.close || []).forEach((c, i) => {
    if (!Number.isFinite(c)) return;
    if (Number.isFinite(q.high?.[i])) high = Math.max(high, q.high[i]);
    if (Number.isFinite(q.low?.[i])) low = Math.min(low, q.low[i]);
    closes.push(c);
    dates.push(new Date(ts[i] * 1000).toLocaleDateString("en-CA", { timeZone: tz }).replace(/-/g, ""));
  });
  if (closes.length < 2) throw new Error("1년 차트 자료가 부족합니다");
  return { closes, dates, high, low };
}

/** 최근 1년 일별 종가(dates는 yyyyMMdd)와 52주 최고·최저. */
export function history(raw) {
  const sym = checked(raw);
  return cached("h:" + sym, 3_600_000, () =>
    KR.test(sym) ? naverHistory(sym.slice(0, 6)).catch(() => yahooHistory(sym)) : yahooHistory(sym).catch((e) => {
      throw e;
    }));
}

const kstDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).replace(/-/g, "");

/**
 * 당일(장이 끝났으면 가장 최근 거래일) 흐름: { points, previous, prevPoints, status, bars, live }.
 * 국내는 NAVER 1분봉, 해외는 Yahoo 1분봉(24시간 지표는 5분봉)으로 마지막 두 거래일을 묶는다.
 */
export function intraday(raw, fallbackPrevious, price) {
  const sym = checked(raw);
  return cached("i:" + sym, 60_000, async () => {
    const path = naverPath(sym);
    const h24 = sym.endsWith("=X") || sym.endsWith("=F") || sym.endsWith("-USD");
    let days = [];
    let lastEpoch = 0;
    let bars;
    let kr = false;
    let tz = "Asia/Seoul";
    if (path) {
      kr = true;
      bars = 391;
      for (const span of [4, 12]) {
        const from = new Date(Date.now() - span * 86_400_000);
        const rows = await json(`https://api.stock.naver.com/chart/domestic/${path}/minute?startDateTime=${kstDay(from)}0900&endDateTime=${kstDay()}1600`);
        const byDay = new Map();
        let lastKey = "";
        for (const r of rows || []) {
          const dt = String(r.localDateTime || "");
          const hhmm = Number(dt.slice(8, 12));
          const c = Number(r.currentPrice);
          if (dt.length < 12 || hhmm < 900 || hhmm > 1530 || !(c > 0)) continue;
          const k = dt.slice(0, 8);
          if (!byDay.has(k)) byDay.set(k, { date: k, closes: [], open: Number(r.openPrice) > 0 ? Number(r.openPrice) : null });
          byDay.get(k).closes.push(c);
          lastKey = dt;
        }
        days = [...byDay.values()].filter((d) => d.closes.length >= 2).sort((a, b) => a.date.localeCompare(b.date));
        if (days.length >= 2) {
          const iso = `${lastKey.slice(0, 4)}-${lastKey.slice(4, 6)}-${lastKey.slice(6, 8)}T${lastKey.slice(8, 10)}:${lastKey.slice(10, 12)}:00+09:00`;
          lastEpoch = Date.parse(iso) / 1000;
          break;
        }
      }
    }
    if (days.length < 2) {
      kr = false;
      const chart = await yahooChart(sym, h24 ? "3d" : "5d", h24 ? "5m" : "1m");
      tz = chart.meta?.exchangeTimezoneName || "UTC";
      bars = h24 ? 288 : 390;
      const ts = chart.timestamp || [];
      const q = chart.indicators?.quote?.[0] || {};
      const byDay = new Map();
      ts.forEach((t, i) => {
        const c = q.close?.[i];
        if (!(c > 0)) return;
        const k = new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: tz }).replace(/-/g, "");
        if (!byDay.has(k)) byDay.set(k, { date: k, closes: [], open: q.open?.[i] > 0 ? q.open[i] : null });
        byDay.get(k).closes.push(c);
        lastEpoch = t;
      });
      days = [...byDay.values()].filter((d) => d.closes.length >= 2).sort((a, b) => a.date.localeCompare(b.date));
    }
    if (days.length < 2) throw new Error("분봉 자료 부족");
    const last = days[days.length - 1];
    const prev = days[days.length - 2];
    const now = Date.now() / 1000;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: tz }).replace(/-/g, "");
    const live = h24 || (last.date === today && now - lastEpoch <= 15 * 60);
    const points = last.closes.slice();
    if (live && price > 0) points[points.length - 1] = price;
    const md = (d) => `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}`;
    const local = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const weekday = local.getDay() >= 1 && local.getDay() <= 5;
    const early = local.getHours() * 100 + local.getMinutes() < 910;
    const status = h24 ? null : live ? "장중" : last.date === today ? "마감" : kr && weekday && early ? "개장 전" : kr ? `휴장 · ${md(last.date)} 마감` : `마감 ${md(last.date)}(미국)`;
    const previous = last.date === today || live ? fallbackPrevious ?? prev.closes[prev.closes.length - 1] : prev.closes[prev.closes.length - 1];
    return { points, previous, prevPoints: prev.closes, open: last.open ?? points[0], status, bars, live };
  });
}

/** 코스피·코스닥 투자자별 순매수(억원). */
export async function investors(sym) {
  const o = await json(`https://m.stock.naver.com/api/index/${sym === "^KS11" ? "KOSPI" : "KOSDAQ"}/trend`);
  return { bizdate: o.bizdate || "", personal: num(o.personalValue), foreign: num(o.foreignValue), institutional: num(o.institutionalValue) };
}

/** 최근 9년 연말 종가(PER 계산용). */
export function yearEndCloses(code) {
  return cached("ye:" + code, 3_600_000, async () => {
    const out = {};
    try {
      const { text } = await fetchSite(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=year&count=9&requestType=0`, { referer: NAVER_REF });
      for (const m of text.matchAll(/<item data="([^"]+)"/g)) {
        const v = m[1].split("|");
        const c = num(v[4]);
        if (v.length >= 5 && c > 0) out[Number(v[0].slice(0, 4))] = c;
      }
    } catch {
      /* 시세가 없으면 PER을 비운다 */
    }
    return out;
  });
}

export const POPULAR = [
  ["005930.KS", "삼성전자", "KRW", "EQUITY"], ["000660.KS", "SK하이닉스", "KRW", "EQUITY"], ["035420.KS", "NAVER", "KRW", "EQUITY"],
  ["035720.KS", "카카오", "KRW", "EQUITY"], ["005380.KS", "현대차", "KRW", "EQUITY"], ["069500.KS", "KODEX 200", "KRW", "ETF"],
  ["360750.KS", "TIGER 미국S&P500", "KRW", "ETF"], ["133690.KS", "TIGER 미국나스닥100", "KRW", "ETF"],
  ["^KS11", "코스피", "KRW", "INDEX"], ["^KQ11", "코스닥", "KRW", "INDEX"],
  ["AAPL", "애플 · Apple", "USD", "EQUITY"], ["MSFT", "마이크로소프트 · Microsoft", "USD", "EQUITY"], ["NVDA", "엔비디아 · NVIDIA", "USD", "EQUITY"],
  ["TSLA", "테슬라 · Tesla", "USD", "EQUITY"], ["MU", "마이크론 · Micron", "USD", "EQUITY"], ["VOO", "Vanguard S&P 500 ETF", "USD", "ETF"],
  ["SPY", "SPDR S&P 500 ETF", "USD", "ETF"], ["QQQ", "Invesco QQQ ETF", "USD", "ETF"], ["SOXX", "iShares 반도체 ETF", "USD", "ETF"],
  ["^IXIC", "나스닥 종합지수", "USD", "INDEX"], ["^GSPC", "S&P 500 지수", "USD", "INDEX"], ["^DJI", "다우존스 지수", "USD", "INDEX"],
  ["^NDX", "나스닥 100 지수", "USD", "INDEX"], ["^SOX", "필라델피아 반도체 지수", "USD", "INDEX"], ["^VIX", "VIX 변동성 지수", "USD", "INDEX"],
].map(([symbol, name, currency, type]) => ({ symbol, name, currency, type }));

const ALIASES = {
  "^IXIC": "nasdaq composite ixic 나스닥 나스닥종합 나스닥지수", "^GSPC": "s&p 500 sp500 snp 에스앤피 gspc",
  "^DJI": "dow jones djia 다우 다우지수", "^NDX": "nasdaq 100 nasdaq100 나스닥100 ndx",
  "^SOX": "philadelphia semiconductor sox 필라델피아 반도체지수", "^VIX": "volatility vix 변동성 공포지수",
  "^KS11": "kospi 코스피", "^KQ11": "kosdaq 코스닥",
};
const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
const US_EX = new Set(["NMS", "NYQ", "NGM", "NCM", "ASE", "PCX", "BTS", "NASDAQ", "NYSE", "NYSEArca"]);

function collectDomestic(v, out) {
  if (Array.isArray(v)) return v.forEach((x) => collectDomestic(x, out));
  if (!v || typeof v !== "object") return;
  const code = String(v.code || "");
  const name = String(v.name || "");
  const reuters = String(v.reutersCode || "");
  const isStock = String(v.url || "").includes("/domestic/stock/") || KR.test(reuters);
  if (/^[A-Z0-9]{6}$/.test(code) && name && isStock) {
    const symbol = KR.test(reuters) ? reuters : code + (String(v.typeName || "").includes("코스닥") ? ".KQ" : ".KS");
    if (!out.has(symbol)) out.set(symbol, { symbol, name, currency: "KRW", type: "EQUITY" });
    return;
  }
  Object.values(v).forEach((x) => collectDomestic(x, out));
}

/** 이름·코드로 국내/미국 주식·ETF·지수를 찾는다. */
export async function search(query) {
  const key = norm(query);
  const out = new Map();
  POPULAR.filter((p) => norm(p.name).includes(key) || norm(p.symbol).includes(key) || norm(ALIASES[p.symbol]).includes(key)).forEach((p) => out.set(p.symbol, p));
  let last = null;
  await json(`https://m.stock.naver.com/front-api/search/autoComplete?query=${encodeURIComponent(query)}&target=stock,index`)
    .then((o) => collectDomestic(o, out))
    .catch((e) => (last = e));
  if (!(out.size && /[가-힣]/.test(query))) {
    await json(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0`)
      .then((o) => {
        for (const v of o.quotes || []) {
          const kind = v.quoteType;
          const sym = v.symbol || "";
          const korean = isKorean(sym);
          const us = US_EX.has(v.exchange) || (kind === "INDEX" && /^\^[A-Z0-9]{2,8}$/.test(sym));
          if ((korean || us) && ["EQUITY", "ETF", "INDEX"].includes(kind) && !out.has(sym)) {
            out.set(sym, { symbol: sym, name: v.shortname || v.longname || sym, currency: korean ? "KRW" : "USD", type: kind });
          }
        }
      })
      .catch((e) => (last = e));
  }
  if (!out.size && last) throw new Error("검색 연결 실패 · 종목 코드로 다시 검색해 주세요");
  return [...out.values()];
}

/** 작은 꺾은선(SVG). values가 2개 미만이면 빈 상자. baseline이 있으면 점선 기준선. */
export function sparkline(values, { width = 300, height = 64, color, baseline, prev, bars } = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "spark");
  if (!values || values.length < 2) return svg;
  const all = values.concat(baseline != null ? [baseline] : [], prev || []);
  const lo = Math.min(...all);
  const span = Math.max(...all) - lo || 1;
  const y = (v) => height - ((v - lo) / span) * height * 0.86 - height * 0.07;
  const total = Math.max(bars || 0, values.length, prev?.length || 0);
  const x = (i, n) => (bars ? (i / (total - 1)) * width : (i / (n - 1)) * width);
  const line = (vals, stroke, extra = {}) => {
    const p = document.createElementNS(ns, "polyline");
    p.setAttribute("points", vals.map((v, i) => `${x(i, vals.length).toFixed(1)},${y(v).toFixed(1)}`).join(" "));
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", stroke);
    p.setAttribute("stroke-width", extra.w || 1.8);
    p.setAttribute("vector-effect", "non-scaling-stroke");
    p.setAttribute("stroke-linejoin", "round");
    if (extra.dash) p.setAttribute("stroke-dasharray", extra.dash);
    svg.append(p);
  };
  if (baseline != null) {
    const l = document.createElementNS(ns, "line");
    l.setAttribute("x1", 0);
    l.setAttribute("x2", width);
    l.setAttribute("y1", y(baseline));
    l.setAttribute("y2", y(baseline));
    l.setAttribute("stroke", "#9aa4b5");
    l.setAttribute("stroke-dasharray", "3 3");
    l.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(l);
  }
  if (prev?.length > 1) line(prev, "#b8c0cc", { w: 1.2 });
  line(values, color || "#1f6feb");
  return svg;
}

export const UP = "var(--up)";
export const DOWN = "var(--down)";
export const tint = (change) => (change > 0 ? UP : change < 0 ? DOWN : "var(--muted)");
export const signed = (v, digits = 0) => (v > 0 ? "▲" : v < 0 ? "▼" : "") + Math.abs(v).toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
