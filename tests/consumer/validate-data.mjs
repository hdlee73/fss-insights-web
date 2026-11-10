// data/cases.json·data/scorecard.json 형식 검사. 사용: node tests/consumer/validate-data.mjs
// 사례 한 건은 출처(url)와 검수일(reviewed)이 반드시 있어야 하고, 인정 비율은 0~100 숫자 또는 null이어야 한다.
import { readFileSync } from "node:fs";
const errs = [];
const read = (p) => JSON.parse(readFileSync(new URL("../../" + p, import.meta.url), "utf8"));
const cases = read("data/consumer/cases.json");
const ids = new Set();
for (const [i, c] of (cases.items || []).entries()) {
  const at = `cases[${i}]${c.id ? " " + c.id : ""}`;
  for (const k of ["id", "title", "sector", "date", "url", "reviewed"]) if (!c[k]) errs.push(`${at}: ${k} 누락`);
  if (ids.has(c.id)) errs.push(`${at}: id 중복`);
  ids.add(c.id);
  if (c.ratio != null && !(typeof c.ratio === "number" && c.ratio >= 0 && c.ratio <= 100)) errs.push(`${at}: ratio는 0~100 숫자 또는 null`);
  if (c.url && !/^https:\/\/(www\.|fine\.)?fss\.or\.kr\//.test(c.url)) errs.push(`${at}: url은 금융감독원 주소여야 함`);
  if (c.reasoning && c.reasoning.length > 400) errs.push(`${at}: 판단 요약은 400자 이내(원문 복제 금지)`);
}
const sc = read("data/consumer/scorecard.json");
for (const [i, c] of (sc.companies || []).entries()) {
  const at = `companies[${i}] ${c.name || ""}`;
  for (const k of ["id", "name", "sector"]) if (!c[k]) errs.push(`${at}: ${k} 누락`);
  for (const g of c.gradeHistory || []) if (!["우수", "양호", "보통", "미흡", "취약"].includes(g.grade)) errs.push(`${at}: 등급 값 오류 ${g.grade}`);
}
console.log(errs.length ? errs.join("\n") : `OK (사례 ${(cases.items || []).length}건, 회사 ${(sc.companies || []).length}곳)`);
process.exit(errs.length ? 1 : 0);
