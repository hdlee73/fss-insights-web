// 오늘의 브리핑 '최근 검사·공시조사·회계감리 결과': 최근 7일 이내의 제재공시(검사)·공시조사결과제재·회계감리결과제재를 한 목록으로 합친다.
import { loadData } from "./accdata.js";
import { actionLine, loadSanctions } from "./sanctions.js";

export const DAYS = 7;
const ymd = (s) => {
  const t = String(s || "").replace(/\D/g, "");
  return t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : "";
};
const cutoff = (days) => {
  const d = new Date(Date.now() - days * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** { items, failed }: items = [{ kind, company, date, summary, href }] 최신순. 한 출처가 실패해도 나머지는 보여 준다(failed 에 이름만). */
export async function loadRecentActions(days = DAYS) {
  const from = cutoff(days);
  const failed = [];
  const safe = (name, p) => p.catch(() => (failed.push(name), null));
  const [san, dis, aud] = await Promise.all([
    safe("제재공시", loadSanctions()),
    safe("공시조사결과제재", loadData("disclosure_sanctions")),
    safe("회계감리결과제재", loadData("audit_actions")),
  ]);
  const items = [];
  for (const c of san?.cases || []) {
    if (c.date >= from) items.push({ kind: "검사", company: c.company, date: c.date, summary: [c.sector, actionLine(c.inst || c.exec || c.staff)].filter(Boolean).join(" · "), href: "#/sanction" });
  }
  const seen = new Set();
  for (const c of dis?.items || []) {
    const date = ymd(c.date || c.postDate);
    if (!c.id || seen.has(c.id) || date < from) continue;
    seen.add(c.id);
    const v = (c.violations || []).find((x) => x.title)?.title;
    items.push({ kind: "공시조사", company: c.company, date, summary: [(c.actions || [])[0], v].filter(Boolean).join(" · "), href: "#/disclosure?id=" + encodeURIComponent(c.id) });
  }
  const seenA = new Set();
  for (const a of aud?.items || []) {
    const key = a.slno || `${a.company}|${a.actionDate}`;
    const date = ymd(a.actionDate);
    if (seenA.has(key) || date < from) continue;
    seenA.add(key);
    items.push({ kind: "회계감리", company: a.company, date, summary: [a.market, (a.actions || []).slice(0, 2).join(", ")].filter(Boolean).join(" · "), href: "#/audit?id=" + encodeURIComponent(key) });
  }
  items.sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
  return { items, failed };
}
