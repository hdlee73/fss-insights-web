// node --test tests/dartmatch.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { pickDart, findDart, forms, queryVariants } from "../js/lib/dartmatch.js";

const it = (name, stock = "", corp = "1") => ({ corp, name, stock });
const same = (a, b) => assert.ok([...forms(a)].some((x) => forms(b).has(x)), `${a} ≠ ${b}`);

test("영문 약어와 한글 읽기", () => {
  same("CK저축은행", "씨케이저축은행"); same("KB라이프생명보험", "케이비라이프생명보험"); same("DB증권", "디비증권");
  same("NH선물", "엔에이치선물"); same("IBK투자증권", "아이비케이투자증권"); same("신한EZ손해보험", "신한이지손해보험");
});
test("꼬리말 차이", () => {
  same("삼성생명보험", "삼성생명"); same("현대해상화재보험", "현대해상"); same("흥국화재해상보험", "흥국화재");
  same("세람상호저축은행", "세람저축은행"); same("코리안리재보험", "코리안리"); same("유진투자증권", "유진증권");
  same("농협손해보험", "NH농협손해보험"); same("한국 에스지증권", "한국에스지증권");
});
test("질의어 후보는 한글 읽기·영문 약어를 포함", () => {
  assert.ok(queryVariants("CK저축은행").includes("씨케이저축은행"));
  assert.ok(queryVariants("비엔케이저축은행").includes("bnk저축은행"));
});
test("다른 회사는 맞추지 않는다", () => {
  assert.equal(pickDart("제너럴재보험 서울지점", [it("제너럴네트")]).match, "none");
  assert.equal(pickDart("신한은행", [it("신한은행지주회사")]).match === "exact", false);
  assert.equal(pickDart("민국저축은행", [it("한국저축은행"), it("부산저축은행")]).match, "none");
});
test("같은 이름이 여럿이면 최근 공시가 있는 법인", async () => {
  const items = [it("신한카드", "", "A"), it("신한카드", "032710", "B")];
  const r = await findDart("신한카드", async () => items, null, async (c) => (c === "A" ? "20260101" : "20260901"));
  assert.equal(r.item.corp, "B");
  const r2 = await findDart("신한카드", async () => items, null, async (c) => (c === "A" ? "20260901" : ""));
  assert.equal(r2.item.corp, "A");
});
test("별칭·정식명칭 확인", async () => {
  assert.equal((await findDart("중소기업은행", async () => [])).item.corp, "00149646");
  const r = await findDart("가나저축은행", async () => [it("다라저축은행", "", "9")], async () => ({ name: "(주)가나저축은행" }));
  assert.equal(r.item.corp, "9");
});
