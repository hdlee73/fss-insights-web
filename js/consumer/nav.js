// 금융소비자 보호 지킴이(가져온 「금융소비자 지킴이」 화면들)와 FSS Insights 뼈대를 잇는 얇은 연결부.
// 하위 화면은 왼쪽 메뉴에 없고 #/guard?p=<하위화면>&… 주소의 탭으로 열린다. 보이스피싱 긴급대응만 독립 메뉴(#/emergency).
import { go as appGo, setHeader as appSetHeader } from "../app.js";
import { cached } from "../core.js";

export const GUARD = "guard";
export const GUARD_TITLE = "금융소비자 보호 지킴이";

/** 지킴이 안의 탭: [하위화면 id, 탭 이름]. 첫 탭이 기본. */
export const SUBS = [
  ["home", "상황별 시작"],
  ["diagnose", "권리구제 진단기"],
  ["cases", "분쟁조정 사례"],
  ["company", "제도권 금융회사 조회"],
  ["scorecard", "소비자보호 성적표"],
  ["tips", "금융꿀팁·소비자경보"],
];
const SUB_IDS = new Set(SUBS.map(([id]) => id));

/** 하위 화면 이동. 지킴이 탭이면 #/guard?p=…, 긴급대응은 독립 메뉴로 보낸다. */
export function go(sub, params = {}, opts) {
  if (sub === "emergency") return appGo("emergency", params, opts);
  if (!SUB_IDS.has(sub)) return appGo(sub, params, opts);
  return appGo(GUARD, { p: sub === "home" ? "" : sub, ...params }, opts);
}

/** 하위 화면이 부르는 제목줄: 큰 제목은 메뉴 이름으로 두고, 하위 화면 이름·설명은 부제로 보인다. */
export function setHeader(title, sub = "", actions = []) {
  const line = title === GUARD_TITLE || title === "금융소비자 지킴이" ? sub : [title, sub].filter(Boolean).join(" · ");
  appSetHeader(GUARD_TITLE, line, actions);
}

/** 같은 주소의 JSON을 읽는다(30분 동안 재사용, 실패하면 예외). */
export function loadJson(path) {
  return cached("json:" + path, 30 * 60 * 1000, async () => {
    const res = await fetch(path);
    if (!res.ok) throw new Error("자료를 불러오지 못했습니다 (" + res.status + ")");
    return res.json();
  });
}
