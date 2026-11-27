// 코스피·코스닥 시가총액 히트맵(트리맵): 칸 크기 = 시가총액, 색 = 전일 대비 등락률. 상위 150개(또는 50개) 일반 종목만 그린다.
// 자료는 서버의 /heatmap(NAVER 시총순 목록을 정리한 작은 JSON, 서버에서 10초 캐시)을 읽는다. 서버가 아직 새 주소를 모르면(404) NAVER 목록을 /fetch 로 직접 읽어 같은 모양으로 만든다.
// 화면에 보이는 동안(숨기기·접기 포함)만 60초(장 밖 5분)마다 새로 읽고, 숨은 탭·오프라인·접힌 상태에서는 서버를 읽지 않는다.
import { ApiError, api, cached, canPoll, fetchSite, forget, h, onResume, openUrl, store } from "../core.js";

import { buildFromNaver, capText, pctText, squarify, tileColor } from "./heatmap-core.js";

export const TOP_CHOICES = [150, 50];
const POLL_OPEN_MS = 30_000; // 장중에는 30초마다(서버 호출량 부담을 줄이려 15초 대신 30초). 숨은 탭에서는 읽지 않는다.
const POLL_CLOSED_MS = 300_000;
const NAVER_ROOT = "https://m.stock.naver.com/api/stocks/marketValue/";
const NAVER_REF = "https://m.stock.naver.com/";

// ---- 자료 읽기 ----

let serverHasHeatmap = true; // 서버가 /heatmap 을 모르면(404) 이 세션에서는 바로 /fetch 로 읽는다.

async function viaFetch(market) {
  const read = async (n) => JSON.parse((await fetchSite(`${NAVER_ROOT}${market}?page=${n}&pageSize=100`, { referer: NAVER_REF })).text);
  const res = await Promise.allSettled([read(1), read(2)]);
  if (res[0].status !== "fulfilled") throw res[0].reason;
  const data = buildFromNaver(res.filter((r) => r.status === "fulfilled").map((r) => r.value), market);
  if (res[1].status !== "fulfilled") data.partial = true;
  return data;
}

export async function loadHeatmap(market) {
  return cached("hm:" + market, 20_000, async () => {
    let data;
    if (serverHasHeatmap) {
      try {
        data = await api("/heatmap", { market });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) serverHasHeatmap = false;
        else throw e;
      }
    }
    if (!data) data = await viaFetch(market);
    if (!Array.isArray(data?.rows) || !data.rows.length) throw new Error("시총 자료가 비었습니다");
    return data;
  });
}

const hhmm = (d) => (d.time && /T\d\d:\d\d/.test(d.time) ? d.time.slice(11, 16) : new Date(d.at || Date.now()).toTimeString().slice(0, 5));

// ---- 화면 ----

/**
 * 히트맵 카드. market: "KOSPI" | "KOSDAQ". alive(): 이 화면이 아직 열려 있는지(닫히면 갱신을 멈춘다).
 * 반환: { el }. 접힌 상태(기본은 펼침)와 150/50 선택은 이 브라우저에 기억한다.
 */
export function heatmapPanel(market, { alive = () => true } = {}) {
  const label = market === "KOSPI" ? "코스피" : "코스닥";
  const hideKey = "market.hm.hide." + market;
  let hidden = store.get(hideKey, false) === true;
  let top = TOP_CHOICES.includes(store.get("market.hm.top", 150)) ? store.get("market.hm.top", 150) : 150;
  let data = null, selected = null, big = false, last = 0, busy = false, err = "";

  const title = h("b", null, label + " 시총 히트맵");
  const sub = h("span", { class: "hm-sub" }, "불러오는 중…");
  const seg = TOP_CHOICES.map((n) => h("button", { type: "button", class: "pill sm", onclick: () => ((top = n), store.set("market.hm.top", n), draw()) }, String(n)));
  const bigBtn = h("button", { type: "button", class: "pill sm", onclick: () => ((big = !big), draw()) }, "⤢ 크게");
  const hideBtn = h("button", { type: "button", class: "pill sm", onclick: () => ((hidden = !hidden), store.set(hideKey, hidden), draw(), hidden || refresh(true)) }, "");
  const map = h("div", { class: "hm-map" });
  const info = h("div", { class: "hm-info" });
  const legend = h("div", { class: "hm-legend" }, "−3%", h("span", { class: "hm-bar" }), "+3% · 크기=시총 · 색=전일 대비 등락률 · 칸을 누르면 종목 정보");
  const body = h("div", { class: "hm-body" }, map, info, legend);
  const el = h("div", { class: "hm" }, h("div", { class: "hm-head" }, title, sub, h("span", { class: "hm-btns" }, ...seg, bigBtn, hideBtn)), body);

  function infoLine() {
    if (!selected) return info.replaceChildren(), (info.hidden = true);
    info.hidden = false;
    info.replaceChildren(
      h("b", null, selected[1]), " ", h("span", { class: "hm-code" }, selected[0]),
      h("span", { style: { color: selected[3] > 0 ? "var(--up)" : selected[3] < 0 ? "var(--down)" : "var(--muted)", fontWeight: 700, marginLeft: "8px" } }, pctText(selected[3])),
      h("span", { class: "hm-code", style: { marginLeft: "8px" } }, "시총 " + capText(selected[2])),
      h("button", { type: "button", class: "pill sm", onclick: () => openUrl("https://m.stock.naver.com/domestic/stock/" + encodeURIComponent(selected[0])) }, "종목 상세 ›"));
  }

  function paint() {
    if (hidden || !data) return;
    const W = Math.floor(map.clientWidth);
    if (W < 80) return; // 아직 배치 전: 크기 관찰이 다시 부른다
    const H = big ? Math.max(260, Math.floor(innerHeight - 190)) : W < 520 ? Math.round(W * 1.1) : Math.round(W * 0.58);
    map.style.height = H + "px";
    const rows = data.rows.slice(0, top);
    const cells = squarify(rows.map((r) => ({ v: r[2], r })), W, H);
    const frag = document.createDocumentFragment();
    for (const c of cells) {
      const [code, name, cap, pct] = c.r;
      const big1 = c.w > 40 && c.h > 30;
      const f = Math.min(Math.max(Math.sqrt(c.w * c.h) / 7, 9), 24);
      const t = h("div", {
        class: "hm-t" + (selected && selected[0] === code ? " sel" : ""),
        title: `${name} · 시총 ${capText(cap)} · ${pctText(pct)}`,
        style: { left: c.x + "px", top: c.y + "px", width: c.w + "px", height: c.h + "px", background: tileColor(pct) },
        onclick: () => ((selected = c.r), infoLine(), paint()),
      });
      if (big1) t.append(h("b", { style: { fontSize: f + "px" } }, name), h("i", { style: { fontSize: Math.max(f * 0.8, 9) + "px" } }, pctText(pct)));
      else if (c.w > 26 && c.h > 15) t.append(h("b", { style: { fontSize: "9px" } }, name.slice(0, Math.max(1, Math.floor(c.w / 10)))));
      frag.append(t);
    }
    map.replaceChildren(frag);
  }

  // 크게 보기 중에만 Esc 로 닫는다(화면을 떠나면 함께 풀린다).
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
    seg.forEach((b, i) => b.classList.toggle("on", TOP_CHOICES[i] === top));
    for (const b of [...seg, bigBtn]) b.hidden = hidden;
    el.classList.toggle("hm-big", big && !hidden);
    bigBtn.textContent = big ? "✕ 닫기" : "⤢ 크게";
    sub.textContent = hidden ? "숨김" : err ? err : data ? `${data.status === "OPEN" ? "장중" : "장 밖"} · ${hhmm(data)} 기준${data.partial ? " · 일부만 표시" : ""}${data.status === "OPEN" ? " · 약 30초마다 갱신" : ""}` : "불러오는 중…";
    infoLine();
    paint();
  }

  async function refresh(force = false) {
    if (hidden || busy || !alive() || !canPoll()) return;
    busy = true;
    try {
      if (force) forget("hm:" + market);
      data = await loadHeatmap(market);
      err = "";
      last = Date.now();
    } catch {
      err = data ? "갱신 실패 · 이전 자료 표시 중" : "시총 자료를 불러오지 못했습니다";
      last = Date.now() - POLL_OPEN_MS + 15_000; // 15초 뒤 다시 시도
    } finally {
      busy = false;
      if (el.isConnected) draw();
    }
  }

  // 크기가 바뀌면(창 크기·휴대폰 회전·메뉴 폭 조절) 다시 배치한다.
  let timer = 0;
  if (typeof ResizeObserver === "function") {
    let w0 = 0, raf = 0;
    new ResizeObserver(() => {
      const w = Math.floor(map.clientWidth);
      if (w === w0) return;
      w0 = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    }).observe(map);
  }
  const off = onResume(() => refresh());
  timer = setInterval(() => {
    if (!alive() || !el.isConnected) return clearInterval(timer), off();
    if (hidden || !canPoll()) return;
    if (Date.now() - last >= (data && data.status !== "OPEN" ? POLL_CLOSED_MS : POLL_OPEN_MS)) refresh();
  }, 5000);

  draw();
  setTimeout(refresh, 0); // 화면을 먼저 보여 주고 자료는 뒤에서 받는다
  return { el };
}
