// ETF 순자산 히트맵(트리맵): 칸 크기 = 순자산총액, 색 = 전일 대비 등락률, 분류(해외주식·채권·국내 시장지수 등)별로 묶고 칸마다 운용사 브랜드 배지를 붙인다.
// 자료는 서버 /heatmap?market=ETF(NAVER ETF 전체 목록을 정리한 작은 JSON, 서버 10초 캐시)를 읽는다. 서버가 아직 이 주소를 모르면(404) 안내만 보이고 더 읽지 않는다.
// 화면에 보이는 동안만 60초(장 밖 5분)마다 읽고, 숨기기·숨은 탭·오프라인에서는 서버를 읽지 않는다(코스피·코스닥 히트맵과 같은 규칙).
import { ApiError, api, cached, canPoll, forget, h, onResume, openUrl, store } from "../core.js";
import { brandColor, capText, layoutEtf, pctText, splitBrand, tileColor } from "./heatmap-core.js";

export const ETF_TOP_CHOICES = [100, 50];
const POLL_OPEN_MS = 15_000; // 장중에는 15초마다(서버 자료가 10초 캐시라 자료 나이는 최대 약 25초). 숨은 탭에서는 읽지 않는다.
const POLL_CLOSED_MS = 300_000;
const HEAD_H = 17;

let serverHasEtf = true; // 서버가 모르면(404) 이 세션에서는 다시 묻지 않는다.

export async function loadEtfHeatmap() {
  return cached("hm:ETF", 10_000, async () => {
    if (!serverHasEtf) throw new ApiError("서버가 ETF 자료를 아직 지원하지 않습니다", 404);
    let data;
    try {
      data = await api("/heatmap", { market: "ETF" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) serverHasEtf = false;
      throw e;
    }
    if (!Array.isArray(data?.rows) || !data.rows.length) throw new Error("ETF 자료가 비었습니다");
    return data;
  });
}

/** 한국 정규장(평일 09:00~15:30 한국시간) 안인지. 휴장일은 모르므로 그날도 15초마다 읽는다. */
export function krOpen(now = Date.now()) {
  const k = new Date(now + 9 * 3600_000); // UTC 필드로 한국시간을 읽는다
  const d = k.getUTCDay(), m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return d >= 1 && d <= 5 && m >= 540 && m <= 935;
}

const hhmm = (d) => new Date(d.at || Date.now()).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

/** 칸 하나(순수 DOM). 크면 [브랜드 배지 / 이름 / 등락률], 작으면 [색 점 + 이름], 아주 작으면 비워 둔다. */
function tileEl(c, selected, onPick) {
  const [code, name, cap, pct] = c.r;
  const { brand, short } = splitBrand(name);
  const color = brandColor(brand);
  const L = [...short].length;
  const f = Math.max(8.5, Math.min(24, Math.sqrt(c.w * c.h) / 5.2, (c.w - 4) / Math.min(Math.max(L, 3), 5) / 1.05));
  const show = c.w > 38 && c.h > 22;
  const badge = brand && c.w > 58 && c.h > 34;
  const t = h("div", {
    class: "hm-t" + (selected && selected[0] === code ? " sel" : ""),
    title: `${name} · 순자산 ${capText(cap)} · ${pctText(pct)}`,
    style: { left: c.x + "px", top: c.y + "px", width: c.w + "px", height: c.h + "px", background: tileColor(pct) },
    onclick: () => onPick(c.r),
  });
  if (show) {
    if (badge) t.append(h("span", { class: "hm-bd", style: { background: color, fontSize: Math.max(7.5, Math.min(11, f * 0.55)) + "px" } }, brand));
    const nm = h("b", { class: "hm-nm", style: { fontSize: f + "px" } }, !badge && brand ? [h("span", { class: "hm-dot", style: { background: color } }), short] : short);
    t.append(nm);
    if (c.h > f * 3.4 && c.w > 46) t.append(h("i", { style: { fontSize: Math.max(f * 0.82, 9) + "px" } }, pctText(pct)));
  }
  return t;
}

/** ETF 히트맵 카드. alive(): 이 화면이 아직 열려 있는지(닫히면 갱신을 멈춘다). 반환: { el }. */
export function etfHeatmapPanel({ alive = () => true } = {}) {
  const hideKey = "market.hm.hide.ETF";
  let hidden = store.get(hideKey, false) === true;
  const saved = store.get("market.hm.etfTop", 0);
  let top = ETF_TOP_CHOICES.includes(saved) ? saved : 0; // 0 = 아직 고르지 않음(화면 폭으로 정한다)
  let data = null, selected = null, big = false, last = 0, busy = false, err = "";

  const title = h("b", null, "ETF 시총 히트맵");
  const sub = h("span", { class: "hm-sub" }, "불러오는 중…");
  const seg = ETF_TOP_CHOICES.map((n) => h("button", { type: "button", class: "pill sm", onclick: () => ((top = n), store.set("market.hm.etfTop", n), draw()) }, String(n)));
  const bigBtn = h("button", { type: "button", class: "pill sm", onclick: () => ((big = !big), draw()) }, "⤢ 크게");
  const hideBtn = h("button", { type: "button", class: "pill sm", onclick: () => ((hidden = !hidden), store.set(hideKey, hidden), draw(), hidden || refresh(true)) }, "");
  const map = h("div", { class: "hm-map" });
  const info = h("div", { class: "hm-info" });
  const legend = h("div", { class: "hm-legend" }, "−3%", h("span", { class: "hm-bar" }), "+3% · 크기=순자산총액 · 색=전일 대비 등락률 · 칸을 누르면 ETF 정보");
  const body = h("div", { class: "hm-body" }, map, info, legend);
  const el = h("div", { class: "hm hm-etf" }, h("div", { class: "hm-head" }, title, sub, h("span", { class: "hm-btns" }, ...seg, bigBtn, hideBtn)), body);

  function infoLine() {
    if (!selected) return info.replaceChildren(), (info.hidden = true);
    info.hidden = false;
    const { brand } = splitBrand(selected[1]);
    info.replaceChildren(
      brand ? h("span", { class: "hm-bd static", style: { background: brandColor(brand) } }, brand) : "",
      h("b", null, selected[1]), " ", h("span", { class: "hm-code" }, selected[0]),
      h("span", { style: { color: selected[3] > 0 ? "var(--up)" : selected[3] < 0 ? "var(--down)" : "var(--muted)", fontWeight: 700, marginLeft: "8px" } }, pctText(selected[3])),
      h("span", { class: "hm-code", style: { marginLeft: "8px" } }, "순자산 " + capText(selected[2]) + (selected[4] ? " · " + (["", "국내 시장지수", "국내 업종·테마", "레버리지·인버스", "해외주식", "원자재", "채권", "혼합·기타"][selected[4]] || "") : "")),
      h("button", { type: "button", class: "pill sm", onclick: () => openUrl("https://m.stock.naver.com/domestic/stock/" + encodeURIComponent(selected[0])) }, "ETF 상세 ›"));
  }

  function paint() {
    if (hidden || !data) return;
    const W = Math.floor(map.clientWidth);
    if (W < 80) return;
    const narrow = W < 520;
    const H = big ? Math.max(260, Math.floor(innerHeight - 190)) : narrow ? Math.round(W * 1.3) : Math.round(W * 0.34);
    map.style.height = H + "px";
    const n = top || (narrow ? 50 : 100);
    const groups = layoutEtf(data.rows.slice(0, n), W, H, HEAD_H);
    const onPick = (r) => ((selected = r), infoLine(), paint());
    const frag = document.createDocumentFragment();
    for (const g of groups) {
      const inner = h("div", { class: "hm-gi", style: { top: HEAD_H + "px", width: g.iw + "px", height: g.ih + "px" } });
      for (const c of g.cells) inner.append(tileEl(c, selected, onPick));
      frag.append(h("div", { class: "hm-g", style: { left: g.x + "px", top: g.y + "px", width: g.w + "px", height: g.h + "px" } },
        h("div", { class: "hm-gh" }, g.name + " ", h("span", null, capText(g.sum))), inner));
    }
    map.replaceChildren(frag);
  }

  const onKey = (e) => {
    if (e.key !== "Escape") return;
    big = false;
    draw();
  };
  function draw() {
    if (big && !hidden && el.isConnected) document.addEventListener("keydown", onKey);
    else document.removeEventListener("keydown", onKey);
    hideBtn.textContent = hidden ? "▼ 펼치기" : "▲ 숨기기";
    hideBtn.setAttribute("aria-expanded", String(!hidden));
    body.hidden = hidden;
    const eff = top || (map.clientWidth && map.clientWidth < 520 ? 50 : 100);
    seg.forEach((b, i) => b.classList.toggle("on", ETF_TOP_CHOICES[i] === eff));
    for (const b of [...seg, bigBtn]) b.hidden = hidden;
    el.classList.toggle("hm-big", big && !hidden);
    bigBtn.textContent = big ? "✕ 닫기" : "⤢ 크게";
    const cnt = data && data.count ? ` · 전체 ${data.count.toLocaleString("ko-KR")}개 중 상위 ${eff}개` : "";
    sub.textContent = hidden ? "숨김" : err ? err : data ? `분류별 · ${hhmm(data)} 기준${cnt}` : "불러오는 중…";
    infoLine();
    paint();
  }

  async function refresh(force = false) {
    if (hidden || busy || !alive() || !canPoll() || !serverHasEtf) return;
    busy = true;
    try {
      if (force) forget("hm:ETF");
      data = await loadEtfHeatmap();
      err = "";
      last = Date.now();
    } catch (e) {
      err = e instanceof ApiError && e.status === 404 ? "ETF 자료는 서버 업데이트 후 표시됩니다" : data ? "갱신 실패 · 이전 자료 표시 중" : "ETF 자료를 불러오지 못했습니다";
      last = Date.now() - POLL_OPEN_MS + 15_000;
    } finally {
      busy = false;
      if (el.isConnected) draw();
    }
  }

  let timer = 0;
  if (typeof ResizeObserver === "function") {
    let w0 = 0, raf = 0;
    new ResizeObserver(() => {
      const w = Math.floor(map.clientWidth);
      if (w === w0) return;
      w0 = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => (top ? paint() : draw()));
    }).observe(map);
  }
  const off = onResume(() => refresh());
  timer = setInterval(() => {
    if (!alive() || !el.isConnected) return clearInterval(timer), off();
    if (hidden || !canPoll()) return;
    if (Date.now() - last >= (krOpen() ? POLL_OPEN_MS : POLL_CLOSED_MS)) refresh();
  }, 5000);

  draw();
  setTimeout(refresh, 0);
  return { el };
}
