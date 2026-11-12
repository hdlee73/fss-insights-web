// 오늘의 브리핑: 날짜·서울 날씨·인삿말, 시장 지표, 주요 금융 통계, 최근 기사(30대 언론), 최근 금융당국 보도자료, 이번 주 금융리포트.
import { setHeader } from "../app.js";
import { cached, h, icon, skeleton, store } from "../core.js";
import { cachedOffline } from "../lib/offline.js";
import { aiAvailable, aiSummary, buildDigest, findSchedules } from "../lib/digest.js";
import * as N from "../lib/news.js";
import { INDEX_CHOICES, KOREA_INDEXES, indexSelection, statSelection } from "../lib/market.js";
import { AGENCIES, customList, latest, latestCustom } from "../lib/agencies.js";
import { drawStats, indexTile } from "./market.js";
import { releaseRow } from "./releases.js";
import { articleRow, loadHome } from "./news.js";
import { isMajor } from "../lib/news.js";

const PRESS = ["FSS", "FSC"];
const PRESS_COUNT = 5;
const ARTICLE_COUNT = 5;
const RESEARCH_PER_AGENCY = 3;

export async function render(root, params, ctx) {
  setHeader("오늘의 브리핑", "한눈에 보는 오늘 시장과 금융당국 소식"); // 새로고침은 헤더 우측 공통 버튼
  const hero = h("section", { class: "br-hero" });
  root.append(hero);
  drawHero(hero, null);

  // 최신 주요 이슈 카드: 많이 나온 말, 원장·위원장 일정, (기기 AI가 있으면) 주요 기사 요약. 아래 기사·보도자료가 도착하는 대로 채워진다.
  const digestBox = h("section", { class: "br-digest card", "aria-live": "polite" });
  // 웹에서는 최신 주요 이슈 카드를 표시하지 않는다(앱에만 있음).
  const digestData = { articles: null, press: null, extra: [], ai: undefined };
  const drawDigest = () => {};
  drawDigest();
  cached("weather", 30 * 60 * 1000, loadWeather).then((w) => ctx.alive() && drawHero(hero, w)).catch(() => {});

  const section = (title, sub, target, body) => h("section", { class: "br-sec" },
    h("div", { class: "br-sh" }, h("div", null, h("h3", null, title), h("small", null, sub)), target ? h("a", { class: "link-more", href: "#/" + target }, "더 보기", icon("chevron-right")) : null),
    body);

  // 시장 지표(시장 동향의 '지표 선택'에서 브리핑에 고른 것)
  const sel = indexSelection().briefing;
  const chosen = INDEX_CHOICES.filter((x) => sel.includes(x.symbol));
  const wide = chosen.filter((x) => KOREA_INDEXES.some((k) => k.symbol === x.symbol));
  const small = chosen.filter((x) => !wide.includes(x));
  const tiles = [];
  const mk = h("div");
  if (wide.length) mk.append(h("div", { class: "tiles wide2" }, wide.map((it) => (tiles.push(indexTile(it, { wide: true, showInvestors: true })), tiles[tiles.length - 1].el))));
  if (small.length) mk.append(h("div", { class: "tiles" }, small.map((it) => (tiles.push(indexTile(it)), tiles[tiles.length - 1].el))));
  if (!chosen.length) mk.append(h("p", { class: "note card" }, "브리핑에 표시할 지표가 없습니다. 금융시장 동향 및 거시경제 지표의 ‘지표 선택’에서 고르세요."));
  root.append(section("시장 지표", "한눈에 보는 오늘 시장", "market", mk));
  tiles.forEach((t) => t.update());
  const timer = setInterval(() => {
    if (!ctx.alive()) return clearInterval(timer);
    if (document.visibilityState === "visible") tiles.forEach((t) => t.update());
  }, 20000);

  // 주요 금융 통계
  const statIds = statSelection().briefing;
  if (statIds.length) {
    const box = h("div");
    root.append(section("주요 금융 통계", "한국은행 ECOS", "market", box));
    drawStats(box, statIds, { compact: true });
  }

  // 최근 기사: 맞춤 뉴스 중 30대 언론 기사만, 가장 최근 순으로
  const newsBox = h("div", { class: "card list" }, skeleton(ARTICLE_COUNT));
  root.append(section("최근 기사", "30대 언론 · 최신순", "news", newsBox));
  loadHome().then((page) => {
    if (!ctx.alive()) return;
    digestData.articles = page.articles;
    drawDigest();
    const top = page.articles.filter((a) => isMajor(a.source, a.link)).sort((a, b) => b.at - a.at).slice(0, ARTICLE_COUNT);
    newsBox.replaceChildren(...(top.length ? top.map((a) => articleRow(a, { compact: true })) : [h("div", { class: "note" }, "30대 언론의 최근 기사가 없습니다.")]));
  }).catch(() => {
    if (!ctx.alive()) return;
    digestData.articles = [];
    drawDigest();
    newsBox.replaceChildren(h("div", { class: "note" }, "기사를 불러오지 못했습니다. 새로고침을 눌러 주세요."));
  });

  // 최근 금융당국 보도자료(금감원·금융위 + 직접 추가한 기관)
  const pressBox = h("div", { class: "card list" }, skeleton(PRESS_COUNT));
  const pressSec = section("최근 금융당국 보도자료", `금융감독원 · 금융위원회 · 최근 ${PRESS_COUNT}건`, "press", pressBox);
  root.append(pressSec);
  const pressSources = [...PRESS.map((id) => [id, AGENCIES.find((a) => a.id === id)]), ...customList("PRESS").map((x) => ["c:" + x.url, null, x])];
  Promise.all(pressSources.map(([key, a, inst]) => cachedOffline("rel:" + key, 10 * 60 * 1000, () => (a ? latest(a, 20) : latestCustom(inst, 20))).then((items) => [key, items]).catch(() => [key, null]))).then((res) => {
    if (!ctx.alive()) return;
    const seen = new Map(res.map(([key]) => [key, new Set(store.get("seen." + key, []))]));
    const all = res.flatMap(([key, items]) => (items || []).map((x) => ({ ...x, _new: seen.get(key).size > 0 && !seen.get(key).has(x.link) })));
    all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    digestData.press = all;
    drawDigest();
    const top = all.slice(0, PRESS_COUNT);
    const fresh = all.filter((x) => x._new).length;
    if (fresh) pressSec.querySelector("small").replaceChildren(h("b", { class: "br-new" }, `새 자료 ${fresh}건`), ` · 최근 ${PRESS_COUNT}건`);
    pressBox.replaceChildren(...(top.length ? top.map((x) => releaseRow(x, { showAgency: true, isNew: x._new })) : [h("div", { class: "note" }, "보도자료를 불러오지 못했습니다. 새로고침을 눌러 주세요.")]));
  });

  // 이번 주 금융리포트: 기본 연구기관마다 최근 7일 자료를 몇 건씩
  const researchBox = h("div", { class: "card list" }, skeleton(3));
  const researchSec = section("이번 주 금융리포트", "기본 연구기관 · 최근 7일 내 업데이트", "research", researchBox);
  root.append(researchSec);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const research = [...AGENCIES.filter((a) => a.group === "RESEARCH").map((a) => [a.id, a]), ...customList("RESEARCH").map((x) => ["c:" + x.url, null, x])];
  Promise.all(research.map(([key, a, inst]) => cachedOffline("rel:" + key, 10 * 60 * 1000, () => (a ? latest(a, 20) : latestCustom(inst, 20)))
    .then((items) => items.filter((x) => (x.date || "") >= weekAgo).slice(0, RESEARCH_PER_AGENCY)).catch(() => []))).then((lists) => {
    if (!ctx.alive()) return;
    const seenLinks = new Set();
    const items = lists.flat().filter((x) => !seenLinks.has(x.link) && seenLinks.add(x.link)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!items.length) return researchSec.remove();
    researchBox.replaceChildren(...items.map((x) => releaseRow(x, { showAgency: true })));
  });

  root.append(h("p", { class: "note", style: { margin: "14px 2px 0" } }, "알림을 켜 두면 새 보도자료·자료실 자료를 모아 알려 드려요. ", h("a", { class: "link-more", href: "#/alerts?view=settings" }, "알림 설정")));
}

// ---- 최신 주요 이슈 카드 ----

/** 금융감독원장·금융위원장 기사를 따로 찾고, 기기 AI가 있으면 주요 기사를 요약한다. */
function loadIssueExtras(data, articles, redraw, ctx) {
  const s = { ...N.settings(), range: "DAY" };
  cachedOffline("issue:sched", 10 * 60 * 1000, async () => {
    const pages = await Promise.all(["금감원장", "금융위원장"].map((q) => N.search(q, s).catch(() => null)));
    return pages.flatMap((p) => (p ? p.articles : []));
  }).then((list) => { if (ctx.alive()) { data.extra = list || []; redraw(); } }).catch(() => {});
  const d = buildDigest(articles, null);
  const lead = d?.lead || [];
  if (!lead.length) { data.ai = null; return; }
  const key = "issue.ai." + lead.map((a) => a.link).join("|").length + ":" + lead[0].link;
  const hit = (() => { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; } })();
  if (hit) { data.ai = hit; redraw(); return; }
  aiAvailable().then(async (ok) => {
    if (!ok || !ctx.alive()) { data.ai = null; return; }
    data.ai = "loading"; redraw();
    const lines = await aiSummary(lead);
    data.ai = lines;
    try { if (lines) sessionStorage.setItem(key, JSON.stringify(lines)); } catch {}
    if (ctx.alive()) redraw();
  });
}


function drawDigestCard(box, data) {
  const head = h("div", { class: "ch" }, icon("activity"), h("h3", null, "최신 주요 이슈"), h("small", { class: "dg-tag" }, "자동 정리"));
  if (data.articles == null) return box.replaceChildren(head, skeleton(3));
  const d = buildDigest(data.articles, data.press);
  if (!d) return box.replaceChildren(head, h("p", { class: "note" }, data.press == null ? "수집된 기사가 아직 없습니다." : "정리할 기사가 아직 없습니다. 잠시 뒤 새로고침해 보세요."));
  const piece = (x) => (typeof x === "string" ? x
    : x.href ? h("a", { href: x.href, target: "_blank", rel: "noopener" }, x.text)
    : h("a", { href: "#/news?q=" + encodeURIComponent(x.q) }, x.text));
  const kids = [head];
  if (Array.isArray(data.ai)) kids.push(h("div", { class: "dg-ai" }, h("b", null, "기기 AI 요약"), h("ul", null, data.ai.map((l) => h("li", null, l)))));
  else if (data.ai === "loading") kids.push(h("div", { class: "dg-ai" }, h("b", null, "기기 AI 요약"), h("p", { class: "note" }, "요약하는 중…")));
  if (d.words.length) kids.push(h("div", { class: "dg-words" }, h("div", { class: "dg-chips" }, d.words.map((w) => h("a", { class: "dg-chip", href: "#/news?q=" + encodeURIComponent(w.text) }, `${w.text} `, h("em", null, w.count))))));
  const sch = findSchedules([...(data.extra || []), ...(d.schedules || [])]).slice(0, 2);
  if (sch.length) kids.push(h("ul", { class: "dg-lines dg-sched" }, sch.map((x) => h("li", null, icon("calendar"), h("span", null, h("b", null, x.who + " "), h("a", { href: x.href, target: "_blank", rel: "noopener" }, x.title), x.source ? ` (${String(x.source).slice(0, 12)})` : "")))));
  kids.push(h("ul", { class: "dg-lines" }, d.lines.map((l) => h("li", null, icon(l.icon), h("span", null, l.parts.map(piece))))));
  kids.push(h("p", { class: "note dg-foot" }, "낱말 집계로 정리한 것입니다. 정확한 내용은 원문을 확인하세요."));
  box.replaceChildren(...kids);
  if (data.press == null) box.append(h("div", { class: "dg-wait" }, "보도자료를 불러오는 중…"));
}

// ---- 머리말 ----

const KO_DAY = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
function seoulNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hour12: false, weekday: "short" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { y: +parts.year, m: +parts.month, d: +parts.day, hour: +parts.hour % 24, wd };
}

function drawHero(hero, w) {
  const now = seoulNow();
  hero.replaceChildren(
    h("div", { class: "br-hero-top" }, h("small", null, "TODAY'S BRIEFING")),
    h("div", { class: "br-hero-row" },
      h("div", null, h("h2", null, `${now.m}월 ${now.d}일 ${KO_DAY[now.wd]}`), h("div", { class: "br-hero-sub" }, "오늘의 브리핑")),
      w ? h("div", { class: "br-weather" }, h("span", { class: "em" }, w.emoji), h("div", null, h("b", null, `${w.temp}°`), h("small", null, `${w.summary} · ${w.min}°/${w.max}°` + (w.rain != null ? ` · 강수 ${w.rain}%` : "")))) : null),
    h("p", { class: "br-greet" }, greeting(now, w)));
}

async function loadWeather() {
  const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1");
  if (!r.ok) throw new Error("weather");
  const j = await r.json();
  const [emoji, summary] = describe(j.current.weather_code);
  const rain = j.daily.precipitation_probability_max?.[0];
  return { emoji, summary, temp: Math.round(j.current.temperature_2m), min: Math.round(j.daily.temperature_2m_min[0]), max: Math.round(j.daily.temperature_2m_max[0]), rain: rain == null ? null : rain };
}
function describe(c) {
  if (c === 0) return ["☀️", "맑음"];
  if (c === 1) return ["🌤️", "대체로 맑음"];
  if (c === 2) return ["⛅", "구름 조금"];
  if (c === 3) return ["☁️", "흐림"];
  if (c === 45 || c === 48) return ["🌫️", "안개"];
  if (c >= 51 && c <= 57) return ["🌦️", "이슬비"];
  if (c >= 61 && c <= 67) return ["🌧️", "비"];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ["❄️", "눈"];
  if (c >= 80 && c <= 82) return ["🌦️", "소나기"];
  if (c >= 95 && c <= 99) return ["⛈️", "뇌우"];
  return ["🌡️", "날씨"];
}

// 앱의 Greeting과 같은 문구 풀: 시간대·요일·계절·날씨. 같은 날 같은 시간대에는 같은 문구.
const G = {
  dawn: ["이른 아침이네요. 조용한 시간에 오늘 이슈부터 훑어보세요.", "일찍 시작하셨네요. 오늘도 차분하게 살펴보시죠.", "새벽 공기만큼 맑은 머리로 시장을 먼저 확인해 보세요."],
  morning: ["좋은 아침입니다. 밤사이 소식부터 정리해 두었습니다.", "커피 한 잔과 함께 오늘의 흐름을 가볍게 짚어 보세요.", "아침 회의 전에 알아 둘 이슈를 모았습니다.", "오늘 하루도 든든하게 시작하시길 바랍니다."],
  lunch: ["점심시간입니다. 식사 전에 헤드라인만 가볍게 보세요.", "든든히 드시고, 오후 일정도 힘차게 이어 가세요.", "한숨 돌리는 시간, 오전 사이 바뀐 소식을 확인해 보세요."],
  afternoon: ["오후도 힘내세요. 장중 흐름을 확인해 보세요.", "나른한 오후, 새로 나온 자료로 환기해 보세요.", "퇴근 전 놓친 소식이 없는지 한 번 더 살펴보세요.", "오후 업무에 도움이 될 소식을 모았습니다."],
  evening: ["수고 많으셨습니다. 하루를 마무리하며 주요 소식을 정리해 보세요.", "퇴근길 가벼운 마음으로 오늘의 마감 시황을 확인해 보세요.", "오늘도 고생하셨습니다. 편안한 저녁 보내세요."],
  night: ["늦은 시간까지 수고 많으십니다. 무리하지 마세요.", "고요한 밤, 내일을 위해 오늘 소식만 가볍게 살펴보세요.", "하루의 끝자락입니다. 충분히 쉬시길 바랍니다."],
  monday: ["새로운 한 주의 시작입니다. 이번 주도 힘차게 출발해 보세요.", "월요일 아침, 이번 주 주요 일정부터 점검해 보세요."],
  midWeek: ["한 주의 중간입니다. 지치지 않게 호흡을 가다듬으세요.", "수요일, 반환점을 돌았습니다. 조금만 더 힘내세요."],
  friday: ["금요일입니다. 한 주 마무리까지 조금만 더 힘내세요.", "주말이 코앞입니다. 마지막까지 꼼꼼하게 챙겨 보세요."],
  weekend: ["주말에도 챙겨 보시는군요. 여유 있게 훑어보세요.", "쉬는 날, 부담 없이 주요 소식만 확인하세요."],
  spring: ["봄기운이 완연합니다. 오늘도 산뜻하게 시작하세요.", "꽃 소식이 들려오는 계절, 시장에도 좋은 소식이 있기를 바랍니다."],
  summer: ["무더운 날씨에 건강 잘 챙기세요.", "여름 한가운데, 시원한 물 한 잔 드시며 보세요."],
  autumn: ["선선한 가을입니다. 결실의 계절에 좋은 하루 되세요.", "높은 하늘만큼 맑은 하루가 되길 바랍니다."],
  winter: ["추운 날씨에 감기 조심하세요.", "따뜻한 차 한 잔과 함께 오늘을 열어 보세요."],
  rainy: ["비가 오는 날입니다. 우산 챙기셨나요?", "빗소리와 함께 차분하게 하루를 시작해 보세요."],
  snowy: ["눈이 내립니다. 길 미끄러우니 조심하세요.", "눈 오는 날, 따뜻하게 입고 안전하게 다니세요."],
  hot: ["오늘은 많이 덥습니다. 수분 보충 잊지 마세요."],
  cold: ["오늘은 쌀쌀합니다. 따뜻하게 챙겨 입으세요."],
  clear: ["하늘이 맑은 날입니다. 점심 산책도 추천드려요."],
  monthStart: ["새달의 첫날입니다. 이번 달도 잘 부탁드립니다."],
  monthEnd: ["이번 달 마무리 시점입니다. 놓친 일정은 없는지 살펴보세요."],
};
const bucket = (hr) => (hr >= 5 && hr <= 8 ? 0 : hr >= 9 && hr <= 11 ? 1 : hr <= 13 && hr >= 12 ? 2 : hr >= 14 && hr <= 17 ? 3 : hr >= 18 && hr <= 21 ? 4 : 5);
function greeting(now, w) {
  const b = bucket(now.hour);
  const pool = [...[G.dawn, G.morning, G.lunch, G.afternoon, G.evening, G.night][b]];
  if (now.wd === 1) pool.push(...G.monday);
  else if (now.wd === 3) pool.push(...G.midWeek);
  else if (now.wd === 5) pool.push(...G.friday);
  else if (now.wd === 0 || now.wd === 6) pool.push(...G.weekend);
  pool.push(...(now.m >= 3 && now.m <= 5 ? G.spring : now.m >= 6 && now.m <= 8 ? G.summer : now.m >= 9 && now.m <= 11 ? G.autumn : G.winter));
  if (now.d === 1) pool.push(...G.monthStart);
  if (now.d === new Date(now.y, now.m, 0).getDate()) pool.push(...G.monthEnd);
  if (w) {
    const t = w.summary;
    if (t.includes("눈")) pool.push(...G.snowy);
    else if (/비|소나기|뇌우/.test(t)) pool.push(...G.rainy);
    else if (w.max >= 30) pool.push(...G.hot);
    else if (w.min <= 0) pool.push(...G.cold);
    else if (t.includes("맑음")) pool.push(...G.clear);
  }
  // 날짜·시간대로 정한 씨앗으로 고른다(다시 열어도 같은 문구)
  let x = (Math.floor(Date.UTC(now.y, now.m - 1, now.d) / 864e5) * 31 + b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return pool[((x ^ (x >>> 16)) >>> 0) % pool.length];
}
