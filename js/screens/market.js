import { h, message } from "../core.js";
export async function render(root) {
  root.append(message("이 화면은 준비 중입니다."));
}
