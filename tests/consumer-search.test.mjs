// 검색 엔진 동작 확인용. 아래 문서는 실제 결정례가 아니라 엔진 테스트용 가상 문장입니다.
import assert from "node:assert/strict";
import * as S from "../js/lib/consumer/search.js";
const docs = [
  { id: "t1", title: "다초점 인공수정체 삽입술 실손의료보험금 지급 여부", issue: "백내장 수술의 치료 목적 인정", tags: ["실손", "백내장"], ratio: 60 },
  { id: "t2", title: "지인 사칭 메신저 피싱 비대면 대출 피해", issue: "금융회사의 본인확인 의무", tags: ["보이스피싱", "대출"], ratio: 30 },
  { id: "t3", title: "주가연계증권 ELS 투자손실 설명의무 위반", issue: "고령 투자자 적합성 원칙", tags: ["ELS", "설명의무"], ratio: 40 },
  { id: "t4", title: "자동차보험 과실비율 분쟁", issue: "교차로 사고 과실 판단", tags: ["자동차"], ratio: null },
  { id: "t5", title: "실손보험 백내장 수술비 지급거절", issue: "수술 필요성", tags: ["실손"], ratio: 50 },
];
const idx = S.buildIndex(docs);
let r = S.search(idx, "백내장 다초점렌즈 실손");
assert.equal(r[0].doc.id === "t1" || r[0].doc.id === "t5", true);
assert.ok(r.slice(0, 2).map((x) => x.doc.id).sort().join() === "t1,t5");
r = S.search(idx, "메신저피싱 비대면 대출"); assert.equal(r[0].doc.id, "t2");
r = S.search(idx, "ELS 설명의무"); assert.equal(r[0].doc.id, "t3");
r = S.search(idx, "엘레베이터 점검"); assert.equal(r.length, 0); // 관련 없는 질문은 결과 없음
r = S.search(idx, "실손보험 다초점"); assert.ok(r.find((x) => x.doc.id === "t1"));
assert.equal(S.similar(idx, "t1")[0].doc.id, "t5");
assert.equal(S.search(idx, "", {}).length, 0);
const st = S.ratioStats(docs); assert.equal(st.n, 4); assert.equal(st.median, 45); assert.equal(st.min, 30); assert.equal(st.max, 60);
assert.equal(S.ratioStats([{ ratio: null }]), null);
console.log("search OK");
