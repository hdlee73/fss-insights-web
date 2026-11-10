import test from "node:test";
import assert from "node:assert/strict";
import { parseAmount, korUnit, truncate } from "../js/lib/finsim/amount.js";
import { parseRange, personName, shift } from "../js/lib/finsim/levels.js";
import { ANNEX3 } from "../js/lib/finsim/data-annex3.js";
import { FINES, LAW_FILES, PENALTIES } from "../js/lib/finsim/data-laws.js";
import { getSource } from "../js/lib/finsim/sources.js";
import { accidentThreshold, casePerson, caseInst, generalRange, instFinal, personFinal } from "../js/lib/finsim/yangjeong.js";
import { baseRate, calcFine } from "../js/lib/finsim/fine.js";
import { calcPenalty } from "../js/lib/finsim/penalty.js";

test("금액 해석", () => {
  assert.equal(parseAmount("81억"), 8_100_000_000);
  assert.equal(parseAmount("1조 2,500억"), 1_250_000_000_000);
  assert.equal(parseAmount("3억5천만"), 350_000_000);
  assert.equal(parseAmount("12,000,000원"), 12_000_000);
  assert.equal(parseAmount("5천"), 5000);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(korUnit(1_234_500_000), "12억 3,450만원");
  assert.equal(truncate(12_345_678, 1e6), 12_000_000);
  assert.equal(truncate(-5, 1e5), 0);
});

test("별표 문구 → 범위", () => {
  assert.deepEqual(pick(parseRange("직무정지 이상")), [0, 1, 1]);
  assert.deepEqual(pick(parseRange("주의적경고 이하")), [3, 4, 3]);
  assert.deepEqual(pick(parseRange("해임권고(면직)~문책경고(감봉)")), [0, 2, 0]);
  assert.deepEqual(pick(parseRange("문책경고(감봉)~주의적경고(견책)")), [2, 3, 2]);
  assert.deepEqual(pick(parseRange("업무정지(정직) 이상")), [0, 1, 1]);
  assert.deepEqual(pick(parseRange("감봉 이상")), [0, 2, 2]);
  assert.deepEqual(pick(parseRange("주의")), [4, 4, 4]);
  assert.deepEqual(pick(parseRange("기관경고 이상", "inst")), [0, 3, 3]);
  assert.deepEqual(pick(parseRange("기관경고~기관주의", "inst")), [3, 4, 3]);
  assert.deepEqual(pick(parseRange("영업정지 이상", "inst")), [0, 2, 2]);
  assert.equal(parseRange("업무정지 6월", "inst").detail, "6월");
  assert.deepEqual(pick(parseRange("등록취소", "inst")), [0, 0, 0]);
  assert.deepEqual(pick(parseRange("업무 전부·일부 정지", "inst")), [1, 2, 1]);
  assert.equal(shift(1, 3, 4), 0);
  assert.equal(shift(4, -2, 4), 5);
  assert.equal(personName(1, "미등기임원"), "업무집행정지 (직원 조치: 정직)");
});

test("별표3 데이터의 모든 문구를 읽을 수 있다", () => {
  for (const it of ANNEX3) {
    assert.ok(getSource("A3:" + it.id), it.id);
    for (const g of it.groups) for (const r of g.rows) {
      const texts = r.pr ? Object.values(r.pr) : [r.p].filter(Boolean);
      for (const t of texts) assert.ok(parseRange(t, "person"), `${it.code} ${r.c} ${t}`);
      if (r.i) assert.ok(parseRange(r.i, "inst"), `${it.code} ${r.c} 기관 ${r.i}`);
      assert.ok(texts.length || r.i, `${it.code} ${r.c} 비어 있음`);
    }
  }
});

test("법령 데이터의 근거가 모두 있다", () => {
  for (const x of [...FINES, ...PENALTIES]) assert.ok(getSource(`L:${x.law}:${x.jo}`), `${x.law} ${x.jo}`);
  for (const x of PENALTIES) assert.ok(getSource(`DECREE:${x.law}`), `${x.law} 시행령`);
});

test("법령 데이터 모양: 고유 id, 금액 범위", () => {
  const ids = new Set();
  for (const x of [...FINES, ...PENALTIES]) {
    assert.ok(!ids.has(x.id), `중복 id ${x.id}`);
    ids.add(x.id);
  }
  assert.ok(LAW_FILES.length >= 17);
  assert.ok(PENALTIES.length > 400, `과태료 ${PENALTIES.length}건`);
  for (const x of PENALTIES) {
    assert.ok(x.max > 0, x.id);
    for (const v of Object.values(x.decreeBy || {})) assert.ok(v > 0 && v <= x.max, `${x.id} 시행령 금액 ${v} > 상한 ${x.max}`);
    for (const arr of Object.values(x.stepsBy || {})) for (const v of arr) assert.ok(v > 0 && v <= x.max, `${x.id} 차수 금액`);
  }
  for (const x of FINES) {
    if (x.kind === "fixed") assert.ok(x.cap > 0, x.id);
    else assert.ok(x.rate > 0, x.id);
    if (x.kind === "revenue") assert.ok(x.fallback > 0, x.id);
  }
});

test("과태료: 임직원·위반 차수·시행령 금액 없는 조항", () => {
  const g = PENALTIES.find((x) => x.id === "지배구조법:P:2-2"); // 겸직 3천만, 임직원 600만
  assert.equal(calcPenalty({ item: g, subject: "법인", motive: "상", result: "중대" }).final, 30_000_000);
  assert.equal(calcPenalty({ item: g, subject: "임직원", motive: "상", result: "중대" }).final, 6_000_000);
  assert.equal(calcPenalty({ item: g, subject: "개인", motive: "상", result: "중대" }).final, 30_000_000);
  const loan = PENALTIES.find((x) => x.stepsBy && x.inspection); // 대부업 검사 불응: 1,000/2,000/3,000, 비법인 500/1,000/1,500
  assert.equal(calcPenalty({ item: loan, subject: "법인", step: 2, motive: "상" }).final, 20_000_000);
  assert.equal(calcPenalty({ item: loan, subject: "개인", step: 3, motive: "상" }).final, 15_000_000);
  const none = PENALTIES.find((x) => !x.decreeBy && !x.stepsBy && !x.byAmount);
  assert.ok(none, "시행령 금액 없는 조항");
  const r = calcPenalty({ item: none, motive: "상", result: "중대" });
  assert.equal(r.final, none.max);
  // 자본시장법 제85조는 제8호만 과태료(제449조①29), 나머지는 벌칙(제444조8호)
  assert.ok(PENALTIES.some((x) => x.id === "자본시장법:P:1-29" && x.title.includes("제85조8호")));
});

test("과태료: 외국환거래법 위반금액 기준(시행령 별표4)", () => {
  const fx = PENALTIES.find((x) => x.law === "외국환거래법" && x.title.includes("자본거래 신고 누락·거짓: 외국환업무취급기관"));
  // max(100만, 10억 × 2%) = 2,000만 × 상·중대 100%
  assert.equal(calcPenalty({ item: fx, violation: 10e8, motive: "상", result: "중대" }).final, 20_000_000);
  assert.equal(calcPenalty({ item: fx, violation: 1e6, motive: "상", result: "중대" }).final, 1_000_000); // 최소 100만
  assert.equal(calcPenalty({ item: fx, violationUnknown: true, motive: "상", result: "중대" }).final, 2_000_000);
  assert.equal(calcPenalty({ item: fx, violation: 100e8, motive: "상", result: "중대" }).final, 100_000_000); // 상한 1억
  assert.ok(calcPenalty({ item: fx, motive: "상" }).errors.length);
  const ex = PENALTIES.find((x) => x.law === "외국환거래법" && x.title.includes("제17조"));
  assert.equal(calcPenalty({ item: ex, violation: 2e8, motive: "상", result: "중대" }).final, 10_000_000); // 5%
});

test("과징금: 정액 대체 한도(가상자산 불공정거래 이익 2배, 산정 곤란 40억)", () => {
  const v = FINES.find((x) => x.law.startsWith("가상자산"));
  assert.equal(calcFine({ item: v, amount: 10e8, scores: {} }).limit, 20e8);
  assert.equal(calcFine({ item: v, revenueUnknown: true, scores: {} }).limit, 40e8);
  assert.ok(calcFine({ item: v, scores: {} }).errors.length);
});

test("예전 조항 번호는 불러올 때 비운다", () => {
  const x = normalizeInspection({ cases: [{ fine: { itemId: "F3" }, pens: [{ itemId: "P12", subject: "??" }] }] });
  assert.equal(x.cases[0].fine.itemId, null);
  assert.equal(x.cases[0].pens[0].itemId, null);
  assert.equal(x.cases[0].pens[0].subject, "법인");
});

test("일반기준(세칙 별표2)", () => {
  assert.equal(generalRange(1, "심함", "고의").text, "해임권고(면직)");
  assert.equal(generalRange(1, "약함", "고의").col, 1);
  assert.equal(generalRange(5, "심함", "경과실").text, "문책경고(감봉)~주의적경고(견책)");
  assert.equal(generalRange(6, "약함", "경과실").text, "주의적경고(견책)");
});

test("별표3 역할별 열과 역할 감경", () => {
  const a = casePerson({ mode: "annex3", item: "I-1", group: 0, row: 1, role: "보조자", roleSteps: 2 }, "직원");
  assert.equal(a.name, "감봉"); // 역할 열이 있으면 역할 감경을 겹치지 않음
  const b = casePerson({ mode: "general", gType: 1, degree: "심함", fault: "중과실", role: "감독자", roleSteps: 1 }, "임원");
  assert.equal(b.base, 0);
  assert.equal(b.level, 1);
  const c = casePerson({ mode: "annex3", item: "II-2", group: 0, row: 0, role: "행위자" });
  assert.ok(c.error); // 기관 기준만 있는 구간
  const d = casePerson({ mode: "annex3", item: "IV-4", group: 0, row: 2, role: "행위자", itemAdj: [0] }, "직원");
  assert.equal(d.name, "면직"); // 감봉 +2단계
});

test("사람 종합: 경합·이력·공적", () => {
  const r = (level) => ({ res: { level } });
  // 주의적경고 3건 → 경합 1단계 → 문책경고
  let f = personFinal({ kind: "임원" }, [r(3), r(3), r(3)]);
  assert.equal(f.level, 2);
  // 주의 포함이면 4건 필요
  f = personFinal({ kind: "임원" }, [r(3), r(3), r(4)]);
  assert.equal(f.level, 3);
  // 가장 무거운 것이 업무집행정지면 경합 가중 없음
  f = personFinal({ kind: "임원" }, [r(1), r(3), r(3)]);
  assert.equal(f.level, 1);
  // 이력 가중 + 공적 감경 상쇄
  f = personFinal({ kind: "임원", hist: { heavy3y: 1 }, adj: { merit: true } }, [r(3)]);
  assert.equal(f.level, 3);
  // 주의에는 공적 감경 불가
  f = personFinal({ kind: "직원", adj: { merit: true } }, [r(4)]);
  assert.equal(f.level, 4);
  // 감경으로 주의 아래 → 면제 검토
  f = personFinal({ kind: "직원", adj: { d50Steps: 1 } }, [r(4)]);
  assert.equal(f.level, 5);
  assert.ok(personFinal({ kind: "직원" }, []).none);
});

test("기관: 사유·손실 기준·가중", () => {
  const th = accidentThreshold(1e12); // 자기자본 1조: 2% = 200억, 1.5조 미만 = 100억 → 100억 초과면 해당
  assert.equal(th.min, 100e8);
  let x = caseInst({ mode: "grounds", grounds: {}, loss: 150e8 }, 1e12);
  assert.equal(x.level, 3);
  x = caseInst({ mode: "grounds", grounds: {}, loss: 50e8 }, 1e12);
  assert.ok(x.none);
  x = caseInst({ mode: "grounds", grounds: { g7b3: true }, mitig: true }, 0);
  assert.equal(x.level, 4);
  x = caseInst({ mode: "annex3", item: "III-5", group: 1, row: 1 }, 0);
  assert.equal(x.name, "영업 일부정지");
  assert.equal(x.detail, "3월");
  const r = (level) => ({ res: { level } });
  const f = instFinal({ instHist: { count3y: 2 } }, [r(4), r(4), r(4), r(4)]);
  assert.equal(f.level, 2); // 기관주의 + 이력 + 4건 경합 = 2단계 가중
});

test("과징금: 별표2 흐름", () => {
  assert.equal(baseRate({ motive: "상", method: "상", gain: "상", harm: "상", market: "상", period: "상" }).rate, 1);
  assert.equal(baseRate({}).rate, 0.75); // 모두 중 = 2.0
  assert.equal(baseRate({ motive: "하", method: "하", gain: "하", harm: "하", market: "하", period: "하" }).rate, 0.5);
  const item = FINES.find((x) => x.law === "은행법" && x.rate === 0.3);
  const r = calcFine({ item, amount: 100e8, scores: {}, mit: { selfFix: 0.5, selfReport: 0.5 } });
  // 한도 30억 × 75% = 22.5억, 감경 100% → 50% 제한 → 11.25억 → 절사 11.25억(100만 단위)
  assert.equal(r.limit, 30e8);
  assert.equal(r.basic, 22.5e8);
  assert.equal(r.final, 1_125_000_000);
  const cap = calcFine({ item, amount: 100e8, scores: {}, capital: 50e8 });
  assert.equal(cap.final, 5e8);
  const fx = FINES.find((x) => x.kind === "fixed" && x.cap === 3e8);
  assert.equal(calcFine({ item: fx, scores: {} }).final, 225_000_000);
  const rev = FINES.find((x) => x.kind === "revenue");
  assert.ok(calcFine({ item: rev, scores: {} }).errors.length);
  assert.equal(calcFine({ item: rev, revenueUnknown: true, scores: {} }).limit, 10e8);
  assert.equal(calcFine({ item, amount: 100e8, scores: {}, exempt: "동일 행위 기제재" }).final, 0);
  // 가중은 법정부과한도를 넘지 못함
  const up = calcFine({ item, amount: 100e8, scores: {}, gain: 100e8 });
  assert.equal(up.adjusted, 30e8);
});

test("과태료: 별표3·별표6 흐름", () => {
  const it = PENALTIES.find((x) => x.law === "금융소비자 보호에 관한 법률" && x.title.includes("설명의무"));
  // 금소법 시행령 별표4: 설명의무 법인 7천만원, 법인 아닌 자 3,500만원
  let r = calcPenalty({ item: it, motive: "중", result: "보통" });
  assert.equal(r.final, 42_000_000);
  assert.equal(calcPenalty({ item: it, subject: "개인", motive: "중", result: "보통" }).final, 21_000_000);
  r = calcPenalty({ item: it, motive: "상", result: "중대", agg5y: 0.2 });
  assert.equal(r.final, 84_000_000);
  r = calcPenalty({ item: it, motive: "하", result: "경미", mit: { selfReport: 0.5, selfFix: 0.5 } });
  assert.equal(r.final, 7_000_000); // 1,400만 × (1-50%)
  r = calcPenalty({ item: it, motive: "중", result: "보통", count: 30, sameTypeCap: true });
  assert.equal(r.final, 1_000_000_000);
  const insp = PENALTIES.find((x) => x.inspection && x.law === "은행법" && !x.person);
  r = calcPenalty({ item: insp, motive: "하", result: "경미" });
  assert.equal(r.resultName, "중대");
  assert.equal(r.final, 60_000_000); // 시행령 1억 × 60%
  const ins = PENALTIES.find((x) => x.id === "보험업법:P:7-2"); // 제85조② 설계사 등, 시행령 500만원
  r = calcPenalty({ item: ins, subject: "개인", motive: "상", annexResult: "보통", count: 3 });
  // 500만 × 50% × 40% = 100만 × 3 = 300만
  assert.equal(r.final, 3_000_000);
  r = calcPenalty({ item: ins, subject: "개인", motive: "하", annexResult: "경미" });
  assert.equal(r.final, 100_000); // 500만×5%×40% = 10만
});

function pick(r) {
  return [r.hi, r.lo, r.def];
}

import { evalInspection, newInspection, newPerson, newPersonEntry, newPenalty, normalizeInspection } from "../js/lib/finsim/model.js";
test("검사건 종합과 불러오기", () => {
  const insp = newInspection();
  const p = newPerson();
  insp.people.push(p);
  insp.capital = 1e12;
  const c = insp.cases[0];
  c.people.push({ ...newPersonEntry(p.id), gType: 6, degree: "약함", fault: "경과실" });
  c.inst.grounds = { g7b3: true };
  c.use.pen = true;
  c.pens.push({ ...newPenalty(), itemId: PENALTIES[12].id });
  const s = evalInspection(insp);
  assert.equal(s.people[0].final.name, "주의적경고");
  assert.equal(s.inst.name, "기관경고");
  assert.ok(s.penTotal > 0);
  assert.deepEqual(s.errors, []);
  const back = normalizeInspection(JSON.parse(JSON.stringify(insp)));
  assert.equal(evalInspection(back).penTotal, s.penTotal);
  assert.throws(() => normalizeInspection({ foo: 1 }));
  // 지워진 관련자를 가리키는 항목은 버린다
  const broken = JSON.parse(JSON.stringify(insp));
  broken.people = [];
  assert.equal(normalizeInspection(broken).cases[0].people.length, 0);
});
