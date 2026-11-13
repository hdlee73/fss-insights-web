// 리스크 대시보드 시뮬레이션용 실데이터 스냅샷 생성기(읽기 전용 GET만 사용, 서버 변경 없음).
// 사용: node make-snapshot.mjs > snapshot.json
const S = "https://news-proxy.hdlee73.workers.dev";
const H = { Origin: "https://www.fssinsights.com" };
const get = async (p, q) => {
  const u = S + p + "?" + new URLSearchParams(q);
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(60000) }); if (r.ok) return r.json(); } catch {}
  }
  return null;
};
const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; };
const clean = (n) => String(n || "").replace(/\(\s*주\s*\)|㈜|주식회사/g, " ").replace(/\s+/g, " ").trim();
const SECTORS = { A: 40, E: 25, F: 25, H: 25, I: 25, C: 12 };   // 권역: 총자산 상위 N개
const KEEP = ["bis", "npl", "delinq", "ncr", "ncr_c", "lev", "liq", "solv", "adj", "lcr"];
const out = { generatedAt: new Date().toISOString(), sectors: {}, demo: {} };
for (const [sec, top] of Object.entries(SECTORS)) {
  const [co, rk] = await Promise.all([get("/fisis/companies", { sector: sec }), get("/fisis/ranking", { sector: sec, offset: 0 })]);
  const assets = rk?.assets || {};
  const list = (co?.items || []).map((c) => ({ code: c.code, name: clean(c.name), a: assets[c.code]?.value ?? 0 })).sort((x, y) => y.a - x.a).slice(0, top);
  const rows = await pool(list, 6, async (c) => {
    const p = await get("/fisis/profile", { sector: sec, finance: c.code });
    if (!p) return null;
    const ratios = {};
    for (const m of p.metrics) if (m.group === "ratio" && KEEP.includes(m.key)) ratios[m.key] = m.points.slice(-9).map((x) => [x.month, x.value]);
    const fin = (k) => p.metrics.find((m) => m.group === "fin" && m.key === k && m.basis === "별도")?.points.slice(-9).map((x) => [x.month, x.value]);
    return { code: c.code, name: c.name, assets: c.a, ratios, netincome_cum: fin("netincome_cum") || [], assetsSeries: fin("assets") || [] };
  });
  out.sectors[sec] = rows.filter(Boolean);
  console.error(sec, out.sectors[sec].length);
}
// 개별 회사 대시보드 시연용: DART 개황·최대주주 + FISIS 코드 + 제재(실제 공시)
// [권역, FISIS 회사명, DART 검색어(없으면 null), DART와의 관계, 제재공시 별칭들]
const DEMO = [["A", "국민은행", "KB금융", "모회사(금융지주)", ["국민은행", "KB국민은행"]], ["A", "신한은행", "신한지주", "모회사(금융지주)", ["신한은행"]], ["F", "미래에셋증권", "미래에셋증권", "본인", ["미래에셋증권"]],
  ["H", "삼성생명보험", "삼성생명", "본인", ["삼성생명보험", "삼성생명"]], ["I", "삼성화재해상보험", "삼성화재", "본인", ["삼성화재해상보험", "삼성화재"]], ["C", "신한카드", "신한카드", "본인", ["신한카드"]], ["E", "에스비아이저축은행", null, "DART 비대상(비상장·외부감사 대상 아님 가정)", ["에스비아이저축은행", "SBI저축은행"]]];
const sanc = await (await fetch("https://raw.githubusercontent.com/hdlee73/FSS_insights/sanction-data/sanctions.json")).json();
const nk = (n) => String(n || "").replace(/주식회사|유한회사|\(주\)|㈜|\(유\)|\s|[.,·]/g, "").toLowerCase();
for (const [sec, fisisName, dartQ, rel, aliases] of DEMO) {
  const f = out.sectors[sec]?.find((r) => nk(r.name).includes(nk(fisisName)) || nk(fisisName).includes(nk(r.name)));
  const s = dartQ ? await get("/dart/search", { q: dartQ }) : null;
  const corp = s?.items?.[0]?.corp;
  const [ci, hd] = corp ? await Promise.all([get("/dart/company", { corp }), get("/dart/holders", { corp })]) : [null, null];
  const keys = aliases.map(nk);
  const cases = (sanc.cases || []).filter((c) => keys.includes(nk(c.co)))
    .map((c) => ({ id: c.id, date: c.date, co: c.co, inst: c.inst, exec: c.exec, staff: c.staff, fine: c.fine, penalty: c.penalty, view: c.view, items: (c.items || []).map((i) => ({ t: i.t, laws: i.laws })) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  out.demo[fisisName] = { sector: sec, fisis: f?.code || null, dart: { rel, corp, name: s?.items?.[0]?.name, company: ci, holders: hd }, sanctions: cases };
  console.error(fisisName, !!f, corp, cases.length);
}
console.log(JSON.stringify(out));
