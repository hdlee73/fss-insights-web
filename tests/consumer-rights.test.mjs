import * as R from "../js/lib/consumer/rights.js";
import assert from "node:assert/strict";
// 대출: 서류 2026-11-01, 지급 2026-11-05 → 11-05+14 = 11-19
let r = R.withdrawal({ type: "loan", contractDate: "2026-11-01", docDate: "2026-11-01", payoutDate: "2026-11-05" });
assert.equal(r.deadline, "2026-11-19");
// 대출: 지급일이 더 빠르면 서류 기준
r = R.withdrawal({ type: "loan", contractDate: "2026-11-01", payoutDate: "2026-11-01" }); assert.equal(r.deadline, "2026-11-15");
// 투자 7일
r = R.withdrawal({ type: "invest", contractDate: "2026-12-28" }); assert.equal(r.deadline, "2027-01-04");
// 보험: 증권 15일 vs 청약 30일 중 먼저
r = R.withdrawal({ type: "insurance", contractDate: "2026-11-01", docDate: "2026-11-10" }); assert.equal(r.deadline, "2026-11-25");
r = R.withdrawal({ type: "insurance", contractDate: "2026-11-01", docDate: "2026-12-10" }); assert.equal(r.deadline, "2026-12-01");
r = R.withdrawal({ type: "insurance", contractDate: "2026-11-01" }); assert.equal(r.deadline, "2026-12-01");
// 윤년·월말
assert.equal(R.addDays("2028-02-25", 7), "2028-03-03");
assert.equal(R.addYears("2024-02-29", 1), "2025-02-28");
assert.equal(R.addYears("2026-11-09", 5), "2031-11-09");
// 주말 이월: 2026-11-14 토 → 11-16 월
assert.equal(R.weekday("2026-11-14"), "토"); assert.equal(R.rollWeekend("2026-11-14"), "2026-11-16"); assert.equal(R.rollWeekend("2026-11-15"), "2026-11-16");
// 상태
r = R.withdrawal({ type: "loan", contractDate: "2026-11-01" }); // 마감 11-15(일) → 월 11-16
let s = R.withdrawalStatus(r, "2026-11-16"); assert.equal(s.level, "urgent");
s = R.withdrawalStatus(r, "2026-11-17"); assert.equal(s.level, "over");
s = R.withdrawalStatus(r, "2026-11-09"); assert.equal(s.left, 6);
// 검증 오류
assert.equal(R.withdrawal({ type: "loan", contractDate: "2026-02-31" }).ok, false);
assert.equal(R.withdrawal({ type: "loan", contractDate: "2026-11-05", docDate: "2026-11-01" }).ok, false);
// 위법계약해지
let w = R.cancellationWindow({ contractDate: "2022-03-01", knownDate: "2026-10-01" }, "2026-11-09");
assert.equal(w.end, "2027-03-01"); assert.equal(w.limiter, "contract"); assert.equal(w.expired, false);
w = R.cancellationWindow({ contractDate: "2022-03-01", knownDate: "2026-03-01" }, "2026-11-09"); assert.equal(w.end, "2027-03-01");
w = R.cancellationWindow({ contractDate: "2024-01-10", knownDate: "2025-01-05" }, "2026-11-09"); assert.equal(w.expired, true);
assert.equal(R.cancellationAssessment({ explanation: "yes" }).level, "high");
assert.equal(R.cancellationAssessment({ explanation: "unsure" }).level, "check");
assert.equal(R.cancellationAssessment({}).level, "low");
console.log("rights OK");
