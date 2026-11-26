// '(이하 "법"이라 한다) 제2조제2호다목…' 처럼 법을 줄여 부르는 정의 바로 뒤의 인용이 법 조문 인용으로 잡히는지 확인
globalThis.Element = class {}; globalThis.document = {}; globalThis.window = globalThis;
const { anchorOf, refersTo, restatedAnchors, LAW_PREFIX } = await import("../js/lib/law-core.js");
import assert from "node:assert/strict";
const no = { main: "2", branch: null };
const t = '「주식회사 등의 외부감사에 관한 법률」(이하 "법"이라 한다) 제2조제2호다목에서 "대통령령으로 정하는 서류"란 다음 각 호의 서류를 말한다.';
const want = { paragraph: null, subparagraph: "2", item: "다" };
assert.deepEqual(anchorOf(t, LAW_PREFIX, no), want);
assert.deepEqual(restatedAnchors(t, no), [want]);
assert.deepEqual(restatedAnchors('법 제2조제3호다목에서 "대통령령으로 정하는 서류"란', no), [{ paragraph: null, subparagraph: "3", item: "다" }]);
assert.equal(refersTo("이 법 제2조의 정의", LAW_PREFIX, no), true);
assert.equal(refersTo("신법 제2조", LAW_PREFIX, no), false);
console.log("law-prefix ok");
