// 시뮬레이션 미리보기: 실서버 없이 snapshot.json(읽기 전용으로 받아 둔 실제 금융통계·DART·제재 자료)으로 같은 화면을 띄운다.
import { mountRisk } from "../../js/screens/risk-view.js";
import { SECTOR_CFG } from "../../js/lib/risk.js";
import { findCompany, dateLabel } from "../../js/lib/fundaum.js";

const snap = window.__RISK_SNAPSHOT__ || (await (await fetch("./snapshot.json")).json());
const asOf = snap.generatedAt.slice(0, 10).replace(/-/g, ".");
const demoByCode = Object.fromEntries(Object.values(snap.demo).map((d) => [d.fisis, d]));

const provider = {
  info: { kind: "sample", label: "시뮬레이션 미리보기 (실서비스 미반영)", detail: `${asOf}에 읽기 전용으로 받아 둔 실제 금융통계(FISIS)·전자공시(DART)·제재공시 스냅샷입니다. 서버·웹·앱에는 아무것도 배포되지 않았습니다. 회사 상세 대시보드는 시연용 7곳(국민은행·신한은행·미래에셋증권·삼성생명·삼성화재·신한카드·에스비아이저축은행)만 열립니다.` },
  async companies(sector) { return (snap.sectors[sector] || []).map((r) => ({ code: r.code, name: r.name, assets: r.assets })); },
  async peers(sector) { return snap.sectors[sector] || []; },
  async overview(sector) {
    if (sector === "G") {
      const fund = { companies: (snap.fund.companies || []).map((c) => ({ name: String(c.n || ""), pub: [+(c.pub?.[0]) || 0], pri: [+(c.pri?.[0]) || 0] })) };
      const items = snap.sectors_G.map((c) => { const f = findCompany(fund, c.name, "G"); return { code: c.code, name: c.name, value: f ? f.pub[0] + f.pri[0] : 0 }; });
      return { items, rows: null, basis: "펀드 순자산(공모+사모)", asOf: dateLabel(snap.fund.asOf.recent), scope: "금융투자협회 자료" };
    }
    const rows = snap.sectors[sector] || [];
    return { items: rows.map((r) => ({ code: r.code, name: r.name, value: r.assets })), rows, basis: "총자산", asOf: "2026.06 분기말", scope: sector === "F" ? "외국계 지점 제외" : "" };
  },
  async company(sector, code) {
    const d = demoByCode[code];
    if (!d) return { dart: { rel: "시뮬레이션에는 이 회사의 DART·제재 자료를 담지 않았습니다(시연용 7곳만)", match: "none" }, sanctions: [], nowYear: 2026, demoMissing: true };
    return { dart: { ...d.dart, match: d.dart.corp ? (d.dart.rel === "본인" ? "exact" : "exact") : "none" }, sanctions: d.sanctions, nowYear: 2026 };
  },
};

const root = document.getElementById("rk-root");
const titleEl = document.getElementById("rk-title");
const subEl = document.getElementById("rk-sub");
const actEl = document.getElementById("rk-acts");
const parse = () => { const [, qs] = location.hash.replace(/^#\/?/, "").split("?"); return Object.fromEntries(new URLSearchParams(qs || "")); };
const go = (p) => { const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v != null && v !== "")).toString(); const hash = "#/risk" + (qs ? "?" + qs : ""); if (hash === location.hash) draw(); else location.hash = hash; };
const setHeader = (t, s, a = []) => { titleEl.textContent = t; subEl.textContent = s; actEl.replaceChildren(...a.filter(Boolean)); };
let seq = 0;
async function draw() {
  const my = ++seq;
  const box = document.createElement("div");
  root.replaceChildren(box);
  window.scrollTo(0, 0);
  try { await mountRisk(box, parse(), { provider, setHeader, go, extraTab: { label: "회사 목록", onSelect: () => { document.getElementById("rk-root").innerHTML = "<div style=\"padding:30px;color:#5b6b86\">(실제 화면에서는 금융회사 주요 현황의 회사 목록으로 이동합니다)</div>"; } }, openUrl: (u) => window.open(u, "_blank", "noopener") }); }
  catch (e) { console.error(e); if (my === seq) box.textContent = "화면 오류: " + e.message; }
}
window.addEventListener("hashchange", draw);
draw();
window.__rk = { go, SECTOR_CFG };
