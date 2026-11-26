// 법 조문을 직접 인용한 시행규칙은 시행령 밑이 아니라 법 조문 아래(인용한 호·목 위치)에 붙고, 위임 근거가 아니면 '단순 인용'으로 빠진다
globalThis.Element = class {}; globalThis.document = {}; globalThis.window = globalThis;
const { Article, buildSplit, articleNo } = await import("../js/lib/law-core.js");
import assert from "node:assert/strict";
const no = articleNo("2");
const law = new Article(no, "정의", `제2조(정의)
이 법에서 사용하는 용어의 뜻은 다음과 같다.
1. "회사"란 제4조제1항에 따른 외부감사의 대상이 되는 주식회사 및 유한회사를 말한다.
2. "재무제표"란 다음 각 목의 모든 서류를 말한다.
가. 재무상태표
나. 손익계산서
다. 그 밖에 대통령령으로 정하는 서류
7. "감사반"이란 다음 각 목의 어느 하나에 해당하는 자를 말한다.
가. 공인회계사법 제7조에 따라 등록한 공인회계사
나. 한국공인회계사회에 등록한 감사반`);
const decree = new Article(no, "재무제표", `제2조(재무제표) 「주식회사 등의 외부감사에 관한 법률」(이하 "법"이라 한다) 제2조제2호다목에서 "대통령령으로 정하는 서류"란 다음 각 호의 서류를 말한다.
1. 자본변동표`);
const rule = new Article(articleNo("2"), "감사반의 등록", `제2조(감사반의 등록) ① 「주식회사 등의 외부감사에 관한 법률」(이하 "법"이라 한다) 제2조제7호나목에 따른 감사반(이하 "감사반"이라 한다)이 되려는 자는 등록하여야 한다.`);
const s = buildSplit({ lawName: "주식회사 등의 외부감사에 관한 법률", lawArticle: law, decreeName: "시행령", decrees: [decree], ruleName: "시행규칙", rules: [rule], supervisory: [], details: [] });
const d = s.root.children.find((c) => c.level === 2 || c.sourceName === "시행령");
assert.ok(d, "시행령이 법 아래에 있어야 함");
assert.equal(d.children.length, 0, "감사반 등록 시행규칙이 시행령 밑에 붙으면 안 됨");
assert.ok(s.cited.some((c) => c.article.title === "감사반의 등록") || s.root.children.some((c) => c.article.title === "감사반의 등록" && c.anchor.subparagraph === "7"), "시행규칙은 법 제7호 나목 쪽에 있어야 함");
console.log("law-tree ok");
