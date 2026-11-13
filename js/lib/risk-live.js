// 리스크 대시보드의 실제 자료 공급원. 새 서버 기능 없이 기존 읽기 전용 경로만 쓴다:
//   /fisis/companies, /fisis/ranking, /fisis/profile (금융통계) · /dart/search, /dart/company, /dart/holders (전자공시) · 제재공시(sanction-data).
import { api, cached } from "../core.js";
import { casesOf, loadSanctions } from "./sanctions.js";
import { nameKey, pickDart } from "./risk.js";

const TTL = 6 * 3600e3;
const KEEP = ["bis", "npl", "delinq", "ncr", "ncr_c", "lev", "liq", "solv", "adj", "lcr"];
const clean = (n) => String(n || "").replace(/\(\s*주\s*\)|㈜|주식회사/g, " ").replace(/\s+/g, " ").trim();
// 금융지주 자회사(은행·카드 등)처럼 자체 DART 공시가 없는 회사는 모회사로 잇는다. 필요한 만큼 이 표에 더한다(검토 필요).
export const PARENT_DART = { 국민은행: ["KB금융", "모회사(금융지주)"], 신한은행: ["신한지주", "모회사(금융지주)"], 하나은행: ["하나금융지주", "모회사(금융지주)"], 우리은행: ["우리금융지주", "모회사(금융지주)"], 농협은행: ["NH농협금융지주", "모회사(금융지주)"] };

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } }));
  return out;
}

const companies = (sector) => cached("risk:co:" + sector, TTL, async () => {
  const [co, rk] = await Promise.all([api("/fisis/companies", { sector }), api("/fisis/ranking", { sector, offset: 0 }).catch(() => ({}))]);
  const assets = rk.assets || {};
  return (co.items || []).map((c) => ({ code: c.code, name: clean(c.name), assets: assets[c.code]?.value ?? 0 })).filter((c) => c.code && c.name).sort((a, b) => b.assets - a.assets);
});

const TOP = { A: 30, E: 30, F: 30, H: 30, I: 30, C: 15 };
const peers = (sector) => cached("risk:peers:" + sector, TTL, async () => {
  const list = (await companies(sector)).slice(0, TOP[sector] || 30);
  const rows = await pool(list, 6, async (c) => {
    const p = await api("/fisis/profile", { sector, finance: c.code });
    const ratios = {};
    for (const m of p.metrics || []) if (m.group === "ratio" && KEEP.includes(m.key)) ratios[m.key] = (m.points || []).slice(-12).map((x) => [x.month, x.value]);
    const fin = (k) => (p.metrics || []).find((m) => m.group === "fin" && m.key === k && m.basis === "별도")?.points.slice(-12).map((x) => [x.month, x.value]) || [];
    return { code: c.code, name: c.name, assets: c.assets, ratios, netincome_cum: fin("netincome_cum"), assetsSeries: fin("assets") };
  });
  return rows.filter(Boolean);
});

async function dartOf(name) {
  const [q, rel] = PARENT_DART[nameKey(name)] || PARENT_DART[name] || [clean(name), "본인"];
  const found = await cached("risk:ds:" + q, 600e3, () => api("/dart/search", { q })).catch(() => ({ items: [] }));
  const { match, item } = pickDart(q, found.items || []);
  if (!item) return { rel, match: "none" };
  const [company, holders] = await Promise.all([
    cached("dart.c:" + item.corp, 3600e3, () => api("/dart/company", { corp: item.corp })).catch(() => null),
    cached("dart.h:" + item.corp, 3600e3, () => api("/dart/holders", { corp: item.corp })).catch(() => null),
  ]);
  return { rel, match: rel === "본인" ? match : "exact", corp: item.corp, name: item.name, company, holders };
}

export function liveProvider() {
  return {
    info: null,
    companies,
    peers,
    async company(sector, code) {
      const row = (await companies(sector)).find((c) => c.code === code);
      const name = row?.name || "";
      const [dart, san] = await Promise.all([dartOf(name), loadSanctions().catch(() => null)]);
      const cases = san ? casesOf(san, name).map((c) => ({ id: c.id, date: c.date, co: c.company, inst: c.inst, exec: c.exec, staff: c.staff, fine: c.fine, penalty: c.penalty, view: c.viewUrl, items: c.items.map((i) => ({ t: i.title, laws: i.laws })) })).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
      return { dart, sanctions: cases, nowYear: new Date().getFullYear() };
    },
  };
}
