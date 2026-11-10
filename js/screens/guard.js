// 금융소비자 보호 지킴이: 하위 기능은 왼쪽 메뉴에 두지 않고 이 화면 위쪽 알약 탭으로 고른다(시안 A).
// 주소: #/guard?p=<하위화면>&<하위화면 조건> — 탭을 바꾸면 기록에 남아 뒤로가기로 직전 탭에 돌아간다.
import { h } from "../core.js";
import { SUBS, go } from "../consumer/nav.js";

const loaders = {
  home: () => import("../consumer/screens/home.js"),
  diagnose: () => import("../consumer/screens/diagnose.js"),
  cases: () => import("../consumer/screens/cases.js"),
  company: () => import("../consumer/screens/company.js"),
  scorecard: () => import("../consumer/screens/scorecard.js"),
  tips: () => import("../consumer/screens/tips.js"),
};

let current = null;

export async function render(root, params, ctx) {
  const { p = "", ...rest } = params;
  const sub = loaders[p] ? p : "home";
  const idx = SUBS.findIndex(([id]) => id === sub);
  const bar = h("div", { class: "tabs pill guard-tabs", role: "tablist", "aria-label": "지킴이 기능" },
    SUBS.map(([id, label], i) => h("button", {
      type: "button", role: "tab", class: i === idx ? "on" : "", "aria-selected": String(i === idx),
      onclick: () => i !== idx && go(id),
    }, label)));
  const body = h("div", { class: "guard-body" });
  root.append(bar, body);
  // 고른 탭이 가로 스크롤 밖에 있으면(휴대폰) 보이게 옮긴다.
  requestAnimationFrame(() => bar.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center" }));

  let mod;
  try {
    mod = await loaders[sub]();
  } catch {
    body.replaceChildren(h("div", { class: "state err" }, "화면을 불러오지 못했습니다. 새로고침해 주세요."));
    return;
  }
  if (!ctx.alive()) return;
  current = mod;
  // 하위 화면의 ctx.go(조건)은 현재 탭(p)을 유지한 채 조건만 바꾼다.
  const subCtx = { ...ctx, id: sub, go: (q = {}, opts) => ctx.go({ p: sub === "home" ? "" : sub, ...q }, opts) };
  await mod.render(body, rest, subCtx);
}

export function leave() {
  try {
    current?.leave?.();
  } catch {}
  current = null;
}
