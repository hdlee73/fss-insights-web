// 한글 초성 검색: "ㄱㄱㅇ" → "금감원", "금ㄱㅇ" 처럼 초성과 글자를 섞어도 찾는다. 영문은 대소문자를 가리지 않는다.
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

const initialOf = (ch) => {
  const c = ch.charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : null;
};
const isCho = (ch) => CHO.includes(ch);

/** 낱말 하나(공백 없음)가 글에 들어 있는지. 초성 자리는 해당 초성으로 시작하는 글자와 맞춘다. */
function hasToken(hay, tok) {
  if (!tok) return true;
  if (!/[ㄱ-ㅎ]/.test(tok)) return hay.includes(tok); // 초성이 없으면 일반 부분 일치
  const t = [...tok];
  const h = [...hay];
  for (let i = 0; i + t.length <= h.length; i++) {
    let ok = true;
    for (let j = 0; j < t.length; j++) {
      const hc = h[i + j];
      if (isCho(t[j]) ? (initialOf(hc) !== t[j] && hc !== t[j]) : hc !== t[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** 검색어를 공백으로 나눈 낱말이 모두 들어 있으면 true (AND). */
export function matchText(text, query) {
  const toks = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const hay = String(text || "").toLowerCase();
  return toks.every((t) => hasToken(hay, t));
}
