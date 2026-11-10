// 금융소비자 지킴이: 내 금융 권리를 챙기는 도구 모음(보이스피싱 긴급대응이 첫 탭).
// 입력한 내용은 이 브라우저 밖으로 나가지 않으며, 금융감독원 등 어떤 기관의 공식 서비스도 아니다.
import { h, tabs, message } from "../core.js";

const TABS = [
  ["emergency", "보이스피싱 긴급대응"],
  ["home", "상황별 시작"],
  ["diagnose", "권리구제 진단기"],
  ["cases", "분쟁조정 사례 검색"],
  ["company", "제도권 금융회사 조회"],
  ["scorecard", "소비자보호 성적표"],
  ["tips", "금융꿀팁·소비자경보"],
];
let active = null;

export async function render(root, params, ctx) {
  const idx = Math.max(0, TABS.findIndex(([k]) => k === params.c));
  const key = TABS[idx][0];
  const { c: _c, ...rest } = params;
  root.append(tabs(TABS.map((t) => t[1]), idx, (i) => ctx.go({ c: TABS[i][0] })));
  const box = h("div", { class: "screen-consumer" });
  root.append(box);
  let mod;
  try {
    mod = await import(`./consumer/${key}.js`);
  } catch {
    box.append(message("화면을 불러오지 못했습니다. 새로고침해 주세요.", { error: true }));
    return;
  }
  if (!ctx.alive()) return;
  active = mod;
  // 하위 화면의 ctx.go(p)는 현재 탭(c)을 유지한 채 상태만 바꾼다.
  await mod.render(box, rest, { ...ctx, go: (p, opts) => ctx.go({ c: key, ...p }, opts) });
  box.append(h("p", { class: "note cx-foot" }, "이 화면은 금융감독원 등 어떤 기관의 공식 서비스가 아니며, 법률자문이 아닌 참고용입니다. 입력한 내용은 이 브라우저 밖으로 나가지 않습니다."));
}

export function leave() {
  try { active?.leave?.(); } catch {}
  active = null;
}
