// 금융소비자 지킴이 화면(독립 사이트에서 가져옴)이 쓰던 go·setHeader를 FSS Insights 웹 뼈대에 맞게 이어 주는 얇은 층.
// 화면 이동은 #/consumer?c=<탭>&… 로 남아 뒤로가기가 직전 탭·상태로 돌아간다.
import { go as appGo, setHeader as appSetHeader, currentRoute } from "../../app.js";
import { h, icon } from "../../core.js";

export function go(id, params = {}, opts = {}) {
  appGo("consumer", { c: id, ...params }, opts);
}

/** 화면 제목줄: 이름은 메뉴 이름으로 고정하고, 각 화면의 설명을 부제로 쓴다. 어느 탭에서든 긴급대응으로 갈 수 있는 단추를 붙인다. */
export function setHeader(_title, sub = "", actions = []) {
  const here = currentRoute().params.c || "emergency";
  const sos = here === "emergency" ? null
    : h("a", { class: "sos", href: "#/consumer?c=emergency", title: "보이스피싱·금융사기 긴급대응" }, icon("alert-triangle"), h("span", { class: "lbl" }, "사기 당했어요"));
  appSetHeader("금융소비자 지킴이", sub, [...actions, sos]);
}
