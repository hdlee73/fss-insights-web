// 유권해석·비조치의견서·행정지도 게시판 읽기. 앱의 RegulatoryParser.kt·RegulatoryRepository.kt를 옮겼다.
// 머리글(제목/시행일/시행여부) 이름으로 열을 찾고, 못 찾으면 행 안의 글에서 추정한다.
// 목록(최대 20건)을 읽은 뒤 각 항목의 상세 페이지를 받아 내용 전체를 검색할 수 있게 한다.
import { fetchSite, store } from "../core.js";
import { compact, decodeEntities } from "./htmllist.js";

export const SOURCES = [
  { id: "LAW_INTERPRETATION", label: "금융위원회 법령해석", tab: "유권해석", kind: "OPINION", detailPath: "LawreqDetail.do", detailParam: "lawreqIdx",
    listUrl: "https://better.fsc.go.kr/fsc_new/replyCase/LawreqList.do?stNo=11&muNo=85&muGpNo=75",
    // 금융소비자 포털(better.fsc.go.kr)은 목록을 스크립트(DataTables)로 그려서, 그 스크립트가 부르는 목록(JSON)을 읽는다.
    json: { path: "replyCase/selectReplyCaseLawreqList.do", body: "",
      row: (r) => ({ title: r.title, serial: r.lawreqNumber, statusText: r.status, dept: r.dpNm || null,
        link: `https://better.fsc.go.kr/fsc_new/replyCase/LawreqDetail.do?muNo=85&stNo=11&lawreqIdx=${r.lawreqIdx}&actCd=R` }) } },
  { id: "NO_ACTION", label: "금융감독원 비조치의견서", tab: "비조치의견서", kind: "OPINION", detailPath: "OpinionDetail.do", detailParam: "opinionIdx",
    listUrl: "https://better.fsc.go.kr/fsc_new/replyCase/OpinionList.do?stNo=11&muNo=86&muGpNo=75",
    json: { path: "replyCase/selectReplyCaseOpinionList.do", body: "",
      row: (r) => ({ title: r.title, serial: r.opinionNumber, statusText: r.status, dept: r.category || null,
        link: `https://better.fsc.go.kr/fsc_new/replyCase/OpinionDetail.do?muNo=86&stNo=11&opinionIdx=${r.opinionIdx}&actCd=R` }) } },
  { id: "FSS_GUIDANCE", label: "금융감독원 행정지도", tab: "금감원 행정지도", kind: "GUIDANCE", guidance: true,
    listUrl: "https://www.fss.or.kr/fss/job/admnstgudc/list.do?menuNo=200492" },
  { id: "FSC_GUIDANCE", label: "금융위원회 행정지도", tab: "금융위 행정지도", kind: "GUIDANCE", guidance: true,
    listUrl: "https://better.fsc.go.kr/fsc_new/status/adminMap/OpertnList.do?stNo=11&muNo=145&muGpNo=60",
    json: { path: "status/adminMap/selectOpertnList.do?actCd=R",
      body: () => `searchKeyword=&searchCondition=&searchDpNo=&searchStartDt=2000-01-01&searchEndDt=${new Date().toISOString().slice(0, 10)}&searchAddFild4=&muNo=145`,
      row: (r) => ({ title: r.title, serial: r.addFild1 || null, date: r.addFild2 || r.eventStartDate || null, statusText: r.addFild4 || (r.eventEndDate ? (r.eventEndDate >= new Date().toISOString().slice(0, 10) ? "시행중" : "종료") : null), dept: r.dpNm || null,
        link: `https://better.fsc.go.kr/fsc_new/status/adminMap/OpertnDetail.do?muNo=145&postNo=${r.postNo}&stNo=11&actCd=R` }) } },
];

const noise = /<!--[\s\S]*?-->|<(script|style|noscript)\b[\s\S]*?<\/\1>/gi;
const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
const cellRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const hrefRe = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const tagRe = /<[^>]+>/g;
const blockRe = /<\/?(p|div|li|ul|ol|tr|td|th|dl|dt|dd|h[1-6]|br|section|article|table|thead|tbody)\b[^>]*>/gi;
const dateRe = /(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/;
const titleHeader = /제목|건명|명칭|지도명|사안|안건/;
const implHeader = /시행\s*일/;
const statusHeader = /시행\s*여부|시행\s*상태|상태|현황|진행/;
const inForceRe = /시행\s*중|운영\s*중|적용\s*중|유효/;
const endedRe = /폐지|종료|해제|효력\s*상실|실효|종결|종료됨|만료/;
const footerRe = /개인정보\s*처리방침|저작권\s*정책|Copyright|COPYRIGHT|찾아오시는\s*길/;
const shortDateRe = /(?<!\d)(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})(?!\d)/;
const compactDateRe = /(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/;
const deptHeader = /관련\s*부서|소관\s*부서|담당\s*부서|부서/;
const serialHeader = /일련\s*번호|연번|번호|No\.?/;
const detailHrefHint = /view|detail|read|seq|idx|no=|id=|\.do\?/i;
const scriptPathRe = /['"](\/[^'"\s]*\.do[^'"\s]*)['"]/;
const jsCallRe = /(?:href|onclick)\s*=\s*["'](?:\s*javascript:)?\s*(?:return\s+)?([A-Za-z_$][\w$.]*)\s*\(([^)]*)\)/gi;
const dataIdRe = /data-(?:idx|seq|id|no|key)[\w-]*\s*=\s*["']([^"']+)["']/i;

function ymd(y, m, d) {
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (+m < 1 || +m > 12 || dt.getUTCMonth() !== +m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 2026-09-30, 2026.9.30, 2026년 9월 30일, 26.09.30, 20260930 모두 읽는다. */
export function parseDate(text) {
  let m = dateRe.exec(text);
  if (m) {
    const v = ymd(m[1], m[2], m[3]);
    if (v) return v;
  }
  m = compactDateRe.exec(text);
  if (m) {
    const v = ymd(m[1], m[2], m[3]);
    if (v) return v;
  }
  m = shortDateRe.exec(text);
  if (m) {
    const v = ymd(2000 + +m[1], m[2], m[3]);
    if (v) return v;
  }
  return null;
}

export function statusOf(text) {
  if (!text) return null;
  if (endedRe.test(text)) return false;
  if (inForceRe.test(text)) return true;
  return null;
}

const cellText = (html) => compact(decodeEntities(html.replace(tagRe, " ")));

function resolve(base, link) {
  const raw = decodeEntities(link).trim();
  if (!raw || raw.startsWith("#") || /^javascript/i.test(raw)) return null;
  try {
    const u = new URL(raw.replace(/ /g, "%20"), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function jsCallOf(...fragments) {
  for (const f of fragments) {
    for (const m of f.matchAll(jsCallRe)) {
      const fn = m[1];
      if (/^(void|alert)$/i.test(fn) || /download|print/i.test(fn)) continue;
      const args = m[2].split(",").map((a) => a.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
      if (args.length) return { fn, args };
    }
    const d = dataIdRe.exec(f);
    if (d) return { fn: "", args: [d[1]] };
  }
  return null;
}

function detailLink(rawHtml, base, listUrl, call, defaultPath, defaultParam) {
  let path = null;
  let param = null;
  if (call.fn) {
    const name = call.fn.split(".").pop().replace(/[$]/g, "\\$");
    const def = new RegExp(`function\\s+${name}\\s*\\(|${name}\\s*[:=]\\s*function\\s*\\(`).exec(rawHtml);
    if (def) {
      const body = rawHtml.slice(def.index + def[0].length, def.index + def[0].length + 900);
      const m = /["']([^"'\s]*\.do)(\?[^"']*)?["']/.exec(body);
      if (m) {
        path = m[1];
        param = /([A-Za-z_]\w*)\s*=/.exec(m[2] || "")?.[1] || null;
      }
    }
  }
  path = path || defaultPath;
  param = param || defaultParam;
  if (!path || !param) return null;
  let extras = [];
  try {
    extras = new URL(listUrl).search.slice(1).split("&").filter((p) => /^(stNo|muNo|muGpNo)=/.test(p));
  } catch {}
  return resolve(base, `${path}?${[`${param}=${encodeURIComponent(call.args[0])}`, ...extras].join("&")}`);
}

function anchorsOf(row, base) {
  return [...row.matchAll(anchorRe)]
    .map((a) => {
      const attrs = a[1];
      const hm = hrefRe.exec(attrs);
      const href = hm ? hm[1] || hm[2] || "" : null;
      const sp = scriptPathRe.exec(attrs);
      const link = (href != null && resolve(base, href)) || (sp && resolve(base, sp[1])) || null;
      return { text: cellText(a[2]), link, attrs };
    })
    .filter((a) => a.text.length >= 2);
}

/** 게시판 목록: 표(tr/td)를 우선하고 머리글 이름으로 열을 찾으며, 표가 없으면 날짜와 상세 링크를 가진 li 항목을 읽는다. */
export function parseList(html, baseUrl, kind = "GENERIC", detailPath = null, detailParam = null) {
  const clean = html.replace(noise, " ");
  const out = [];
  let headers = [];
  for (const rm of clean.matchAll(rowRe)) {
    const trAttrs = rm[1];
    const row = rm[2];
    const cells = [...row.matchAll(cellRe)];
    if (!cells.length) continue;
    const texts = cells.map((c) => cellText(c[2]));
    if (!cells.some((c) => c[1].toLowerCase() === "td")) {
      if (!headers.length || texts.length > headers.length) headers = texts;
      continue;
    }
    const aligned = headers.length === texts.length;
    const idx = (re) => (aligned ? headers.findIndex((h) => re.test(h)) : -1);
    const cell = (re) => {
      const i = idx(re);
      return i >= 0 && texts[i] ? texts[i] : null;
    };
    const anchors = anchorsOf(row, baseUrl);
    const dateIdx = idx(implHeader);
    const date = (dateIdx >= 0 && parseDate(texts[dateIdx] || "")) || texts.map(parseDate).find(Boolean) || parseDate(decodeEntities(row));
    const dept = cell(deptHeader);
    const statusIdx = idx(statusHeader);
    const statusText = (statusIdx >= 0 && texts[statusIdx]) || (kind === "GUIDANCE" ? texts.find((t) => statusOf(t) != null && t.length <= 12) : null) || null;
    const serial = cell(serialHeader) || (kind === "OPINION" && texts[0] && texts[0].length <= 12 && /\d/.test(texts[0]) ? texts[0] : null);
    const longest = anchors.reduce((b, a) => (!b || a.text.length > b.text.length ? a : b), null);
    const title = cell(titleHeader) || (longest && longest.text.length >= 2 ? longest.text : null) ||
      texts.filter((t) => t.length >= 4 && !parseDate(t) && t !== serial).reduce((b, t) => (!b || t.length > b.length ? t : b), null);
    if (!title) continue;
    const titled = anchors.find((a) => title.startsWith(a.text.slice(0, 10)) || a.text.startsWith(title.slice(0, 10)));
    let link = titled?.link || anchors.find((a) => a.link)?.link || null;
    if (!link) {
      const call = jsCallOf(titled?.attrs || "", trAttrs, row);
      if (call) link = detailLink(html, baseUrl, baseUrl, call, detailPath, detailParam);
    }
    out.push({ title, link, date, statusText, serial, dept });
  }
  if (out.length) return out;
  return [...clean.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => {
      const body = m[1];
      const date = parseDate(cellText(body));
      if (!date) return null;
      const anchor = anchorsOf(body, baseUrl).filter((a) => a.link && detailHrefHint.test(a.link)).reduce((b, a) => (!b || a.text.length > b.text.length ? a : b), null);
      if (!anchor || anchor.text.length < 4) return null;
      return { title: anchor.text, link: anchor.link, date, statusText: null, serial: null, dept: null };
    })
    .filter(Boolean);
}

/** 상세 페이지 HTML을 읽을 수 있는 글로 바꾼다. 제목이 나오는 지점부터 쓰고 하단 안내문은 자른다. */
export function htmlToText(html, title = "", maxLength = 12000) {
  const text = decodeEntities(html.replace(noise, " ").replace(blockRe, "\n").replace(tagRe, " "));
  let joined = text.split("\n").map(compact).filter(Boolean).join("\n");
  if (title.length >= 6) {
    const at = joined.indexOf(title.slice(0, 15));
    if (at > 0) joined = joined.slice(at);
  }
  const f = footerRe.exec(joined);
  if (f && f.index > 200) joined = joined.slice(0, f.index);
  return joined.slice(0, maxLength);
}

const implDetail = /(?:시행\s*일|회신\s*일|제재\s*조치\s*요구일)(?:자)?\s*[:：]?\s*(20\d{2}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2})/;
const statusDetail = /(?:시행\s*여부|시행\s*상태|상\s*태|현\s*황)\s*[:：]?\s*([가-힣]{2,8})/;

export function detailFields(text) {
  const i = implDetail.exec(text);
  return [i ? parseDate(i[1]) : null, statusDetail.exec(text)?.[1] || null];
}

export function matches(item, query) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = (item.title + "\n" + (item.body || "")).toLowerCase();
  return tokens.every((t) => hay.includes(t.toLowerCase()));
}

export function snippet(item, query, radius = 45) {
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    if (item.title.toLowerCase().includes(token.toLowerCase())) continue;
    const body = item.body || "";
    const at = body.toLowerCase().indexOf(token.toLowerCase());
    if (at < 0) continue;
    const from = Math.max(0, at - radius);
    const to = Math.min(body.length, at + token.length + radius);
    return (from > 0 ? "…" : "") + body.slice(from, to).replace(/\n/g, " ") + (to < body.length ? "…" : "");
  }
  return null;
}

const pageUrl = (listUrl, page) => (page <= 1 ? listUrl : `${listUrl}&pageIndex=${page}&curPage=${page}`);

async function fetchJsonRows(source) {
  const j = source.json;
  const extra = typeof j.body === "function" ? j.body() : j.body;
  const { text } = await fetchSite("https://better.fsc.go.kr/fsc_new/" + j.path, {
    method: "POST", body: `draw=1&start=0&length=20${extra ? "&" + extra : ""}`, referer: source.listUrl,
  });
  return (JSON.parse(text).data || []).map((r) => ({ date: null, ...j.row(r), title: compact(decodeEntities(String(j.row(r).title || "").replace(tagRe, " "))) }));
}

async function fetchRows(source) {
  if (source.json) {
    try {
      const rows = await fetchJsonRows(source);
      if (rows.length) return rows;
    } catch {
      /* 아래의 화면 읽기로 */
    }
  }
  const rows = new Map();
  let failure = null;
  for (let page = 1; page <= 6; page++) {
    const url = pageUrl(source.listUrl, page);
    let parsed = [];
    try {
      parsed = parseList((await fetchSite(url)).text, url, source.kind, source.detailPath, source.detailParam);
    } catch (e) {
      failure = failure || e;
    }
    const before = rows.size;
    for (const r of parsed) {
      const key = r.link && r.link !== source.listUrl ? r.link : (r.serial || "") + r.title + r.date;
      if (!rows.has(key)) rows.set(key, r);
    }
    if (rows.size >= 20 || rows.size === before) break;
  }
  if (!rows.size) throw new Error(`${source.label} 목록을 읽지 못했습니다. 사이트가 접속을 막았거나 구조가 바뀌었을 수 있습니다. ‘사이트에서 보기’를 이용해 주세요.` + (failure ? ` (${failure.message})` : ""));
  return [...rows.values()].slice(0, 20);
}

async function withDetail(item) {
  if (item.link === item.listUrl) return item;
  const { text: html } = await fetchSite(item.link);
  const text = htmlToText(html, item.title);
  const [impl, status] = detailFields(text);
  const statusText = item.statusText || status;
  return { ...item, body: text, date: item.date || impl, statusText, inForce: item.inForce ?? statusOf(statusText) };
}

const cacheKey = (s) => "reg." + s.id;
export function cachedItems(source) {
  return store.get(cacheKey(source), []);
}

/** 최신 20건. 목록이 읽히면 onList로 먼저 보여 주고, 상세 내용을 4건씩 받아 다시 onList로 넘긴다. */
export async function load(source, onList = () => {}) {
  const rows = await fetchRows(source);
  let items = rows.map((r) => ({ source: source.id, listUrl: source.listUrl, title: r.title, link: r.link || source.listUrl, date: r.date, body: "", statusText: r.statusText, inForce: statusOf(r.statusText), serial: r.serial, dept: r.dept }));
  onList(items);
  const out = [...items];
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await withDetail(items[i]).catch(() => items[i]);
      }
    })
  );
  items = source.guidance ? out.sort((a, b) => (b.date || "").localeCompare(a.date || "")) : out;
  // 브라우저 저장 공간을 아끼려고 내용은 앞부분만 보관한다(검색은 이번에 받은 전체 내용으로).
  store.set(cacheKey(source), items.map((x) => ({ ...x, body: (x.body || "").slice(0, 3000) })));
  return items;
}
