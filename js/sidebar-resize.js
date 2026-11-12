// 왼쪽 메뉴 폭 조절(PC): 가장자리를 드래그해 폭을 바꾸고, 더블클릭하면 기본 폭으로 돌아간다.
// 폭은 브라우저(localStorage)에 저장한다. 접힘 상태·휴대폰 서랍에서는 손잡이가 숨겨진다.
const KEY = "fss.sideWidth";
export const SIDE_DEFAULT = 264;
export const SIDE_MIN = 220;
export const SIDE_MAX = 480;

export function clampWidth(w) {
  const n = Number(w);
  if (!Number.isFinite(n)) return SIDE_DEFAULT;
  // 본문이 너무 좁아지지 않게 창 폭의 절반을 넘기지 않는다.
  const cap = Math.max(SIDE_MIN, Math.min(SIDE_MAX, Math.floor(innerWidth * 0.5)));
  return Math.round(Math.min(cap, Math.max(SIDE_MIN, n)));
}

function load() {
  try {
    const v = localStorage.getItem(KEY);
    return v == null ? null : Number(v);
  } catch { return null; }
}
function save(w) {
  try { w == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, String(w)); } catch { /* 저장 못 해도 동작에는 지장 없음 */ }
}

export function installSidebarResize() {
  const side = document.getElementById("side");
  if (!side || document.getElementById("side-resizer")) return;
  const root = document.documentElement;
  const apply = (w) => (w == null ? root.style.removeProperty("--side-user") : root.style.setProperty("--side-user", w + "px"));
  const mobile = matchMedia("(max-width: 860px)");

  let cur = load();
  if (cur != null) { cur = clampWidth(cur); apply(cur); }

  const bar = document.createElement("div");
  bar.id = "side-resizer";
  bar.className = "side-resizer";
  bar.setAttribute("role", "separator");
  bar.setAttribute("aria-orientation", "vertical");
  bar.setAttribute("aria-label", "메뉴 폭 조절 (드래그, 더블클릭: 기본 폭)");
  bar.title = "드래그해서 메뉴 폭 조절 · 더블클릭: 기본 폭";
  bar.tabIndex = 0;
  side.after(bar);

  const widthNow = () => side.getBoundingClientRect().width;
  const set = (w, persist) => { cur = clampWidth(w); apply(cur); if (persist) save(cur); };

  let startX = 0, startW = 0, dragging = false;
  bar.addEventListener("pointerdown", (e) => {
    if (mobile.matches || e.button !== 0) return;
    dragging = true; startX = e.clientX; startW = widthNow();
    bar.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    e.preventDefault();
  });
  bar.addEventListener("pointermove", (e) => { if (dragging) set(startW + e.clientX - startX, false); });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("resizing");
    save(cur);
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
  bar.addEventListener("dblclick", () => { cur = null; apply(null); save(null); });
  // 키보드: 손잡이에 포커스를 두고 ←/→ (Shift는 크게), Home은 기본 폭.
  bar.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === "ArrowLeft") set(widthNow() - step, true);
    else if (e.key === "ArrowRight") set(widthNow() + step, true);
    else if (e.key === "Home") { cur = null; apply(null); save(null); }
    else return;
    e.preventDefault();
  });
  // 창이 좁아졌을 때 저장된 폭이 너무 크면 줄인다.
  addEventListener("resize", () => { if (cur != null && !mobile.matches) { const c = clampWidth(cur); if (c !== cur) set(c, false); } });
}
