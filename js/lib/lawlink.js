// 글 속 법조문 인용("자본시장법 제85조", 「은행법」 제34조의2 …)을 찾아 스마트 법령검색(#/law)으로 가는 링크로 바꾼다.
// 법령명을 알 수 있는 인용만 연결한다("법 제3조"처럼 어떤 법인지 모르는 것은 글자로 둔다).
import { h } from "../core.js";
import { findCitations } from "./law-core.js";

const CTX = { lawName: "", decreeName: "", ruleName: "", ownName: "" };

/** 글 → [글·<a>…] 목록(h()의 자식으로 바로 넣을 수 있다). 인용이 없으면 [text]. */
export function linkLaws(text) {
  const s = String(text ?? "");
  let cites = [];
  try {
    cites = findCitations(s, CTX).filter((c) => c.query && !/^\s|^(시행령|시행규칙|규칙|령|영|법)\s/.test(c.query));
  } catch {
    cites = [];
  }
  // "제9조 제9항, 제119조 및 제125조"처럼 법령명 없이 이어지는 조문은 앞 인용의 법령으로 본다.
  const more = [];
  for (const c of cites) {
    const base = c.query.replace(/\s*제\s*\d+조(?:의\d+)?\s*$/, "");
    if (!base) continue;
    let end = c.end;
    for (;;) {
      const m = /^(?:\s*제\s*\d+\s*항)?(?:\s*제\s*\d+\s*호)?\s*(?:,|및|·|와|과)\s*(제\s*(\d+)\s*조(?:\s*의\s*(\d+))?)/.exec(s.slice(end));
      if (!m) break;
      const start = end + m[0].length - m[1].length;
      end = start + m[1].length;
      if (cites.some((x) => start < x.end && end > x.start)) break;
      more.push({ start, end, query: `${base} 제${m[2]}조${m[3] ? "의" + m[3] : ""}` });
    }
  }
  cites = [...cites, ...more].sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  for (const c of cites) {
    if (c.start < pos) continue;
    if (c.start > pos) out.push(s.slice(pos, c.start));
    out.push(h("a", { class: "lawlink", href: "#/law?q=" + encodeURIComponent(c.query), title: `${c.query} 스마트 법령검색` }, s.slice(c.start, c.end)));
    pos = c.end;
  }
  if (pos < s.length) out.push(s.slice(pos));
  return out.length ? out : [s];
}
