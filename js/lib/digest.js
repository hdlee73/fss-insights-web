// 최신 주요 이슈: 수집된 기사·보도자료에서 많이 나온 말, 금융감독원장·금융위원장 일정, 감독·제재 기사, 보도자료를 규칙으로 뽑는다.
// 기기 안 AI(Chrome 내장 Gemini Nano 등)를 쓸 수 있으면 aiSummary()로 최신 주요 기사 내용을 요약한다(외부 전송 없음).
import { isMajor } from "./news.js";

const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const STOP = new Set(["관련", "대한", "위한", "통해", "이번", "지난", "올해", "내년", "오늘", "내일", "기자", "단독", "속보", "종합", "포토", "영상", "사진", "한다", "했다", "하는", "된다", "있다", "없다", "것으로", "따르면", "에서", "으로", "에게", "대해", "이후", "가운데", "발표", "공개", "전망", "예정", "논란", "확대", "추진", "강화", "지원", "시작", "개최", "나선", "나온", "나서", "열린", "밝혔다", "금융", "은행", "증권", "보험", "시장", "정부", "한국"]);
const JOSA = /(으로|에서|에게|까지|부터|처럼|보다|이라|라고|이다|에는|에도|은|는|이|가|을|를|의|에|도|로|와|과|만)$/;

/** 제목에서 낱말 후보를 뽑는다(2글자 이상 한글·영문 낱말, 끝의 조사는 떼기). */
export function titleTerms(title) {
  const out = new Set();
  for (const raw of String(title || "").replace(/[\[\]【】()「」'"‘’“”·…,.:;!?]/g, " ").split(/\s+/)) {
    let w = raw.replace(/^[^가-힣a-zA-Z0-9]+|[^가-힣a-zA-Z0-9]+$/g, "");
    if (/[가-힣]/.test(w) && w.length > 2) w = w.replace(JOSA, "");
    if (w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.add(w.toLowerCase());
  }
  return [...out];
}

const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
const clip = (s, n = 38) => (s.length > n ? s.slice(0, n - 1) + "…" : s);


const WHO = [[/금융감독원장|금감원장/, "금융감독원장"], [/금융위원장|금융위\s*위원장/, "금융위원장"]];
// 실제 일정으로 볼 만한 말만(사진 설명·인사말 기사는 제외)
const SCHED = /간담회|방문|주재|면담|회동|점검회의|현장|특강|토론회|세미나|포럼|업무보고|국정감사|국감|기자간담|취임식|협약식/;
const CAPTION = /대화하는|인사하는|악수|사진|포토|참석한|질의|답변하는|발언하는|입장하는|이야기/;
/** 기사·보도자료 제목에서 원장·위원장 일정으로 보이는 것(최근 순, 최대 4건). */
export function findSchedules(items) {
  const out = [];
  const seen = new Set();
  for (const a of items || []) {
    const t = a.title || "";
    const who = WHO.find(([re]) => re.test(t));
    if (!who || CAPTION.test(t) || !SCHED.test(t)) continue;
    const key = who[1] + t.replace(/[^가-힣a-zA-Z0-9]/g, "").slice(0, 14);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ who: who[1], title: t, href: a.link, source: a.source || a.label || "", at: a.at || (a.date ? Date.parse(a.date) : 0) });
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0)).filter((x, i, arr) => arr.findIndex((y) => y.who === x.who) === i).slice(0, 2);
}

// ---- 기기 안 AI 요약 ----
function aiApi() {
  const g = globalThis;
  return g.LanguageModel || g.ai?.languageModel || null;
}
/** 이 기기에서 바로 쓸 수 있는 온디바이스 AI가 있는지(내려받아야 하는 상태는 쓰지 않는다). */
export async function aiAvailable() {
  try {
    const api = aiApi();
    if (!api) return false;
    const opts = { expectedInputs: [{ type: "text", languages: ["ko"] }], expectedOutputs: [{ type: "text", languages: ["ko"] }] };
    const a = await api.availability(opts);
    return a === "available" || a === "readily";
  } catch {
    return false;
  }
}
/** 최신 주요 기사(제목·요약문)를 한국어 3줄로 요약. 실패하면 null. */
export async function aiSummary(articles) {
  if (!(await aiAvailable())) return null;
  const api = aiApi();
  let session;
  try {
    const src = articles.slice(0, 6).map((a, i) => `${i + 1}. ${a.title} - ${String(a.summary || "").slice(0, 120)}`).join("\n");
    session = await api.create({ expectedInputs: [{ type: "text", languages: ["ko"] }], expectedOutputs: [{ type: "text", languages: ["ko"] }] });
    const raw = await session.prompt(`다음은 금융 관련 최신 주요 기사입니다. 지금 가장 중요한 이슈를 한국어로 세 줄 이내(줄마다 60자 이내)로 요약하세요. 머리말이나 설명 없이 요약문만 쓰세요.\n\n${src}`);
    const lines = String(raw).split(/\n+/).map((l) => l.replace(/^[\s\-*•\d.)]+/, "").replace(/[*#]+/g, "").trim()).filter((l) => l.length >= 8).slice(0, 3);
    return lines.length ? lines : null;
  } catch {
    return null;
  } finally {
    try { session?.destroy(); } catch {}
  }
}

/**
 * @param articles 맞춤 뉴스 기사 목록
 * @param press 금융당국 보도자료 [{title, link, date, label}] (없으면 null)
 * @returns { label, lines: [{ icon, parts: [string | {text, q?, href?}] }], total } | null
 */
export function buildDigest(articles, press, now = Date.now()) {
  const list = Array.isArray(articles) ? articles : [];
  const today = seoulDay(now);
  let arts = list.filter((a) => a.at && seoulDay(a.at) === today);
  let label = "오늘";
  if (arts.length < 3) {
    arts = list.filter((a) => a.at && now - a.at < 864e5);
    label = "최근 24시간";
  }
  if (arts.length < 3) {
    const latestDay = list.filter((a) => a.at).map((a) => seoulDay(a.at)).sort().pop();
    if (latestDay) {
      arts = list.filter((a) => a.at && seoulDay(a.at) === latestDay);
      label = latestDay === today ? "오늘" : latestDay.slice(5).replace("-", "월 ") + "일";
    }
  }
  const pressToday = (press || []).filter((p) => p.date && p.date >= seoulDay(now - 864e5)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!arts.length && !pressToday.length) return null;

  const lines = [];
  let words = [];
  if (arts.length) {
    const major = arts.filter((a) => isMajor(a.source, a.link)).length;
    // 1) 규모와 많이 다뤄진 내 키워드
    const kw = new Map();
    for (const a of arts) for (const k of a.matched || []) kw.set(k, (kw.get(k) || 0) + 1);
    const topKw = top(kw, 3);

    // 2) 제목 속 자주 나온 말(키워드와 겹치지 않는 것)
    const known = new Set([...kw.keys()].flatMap((k) => k.toLowerCase().split(/\s+/)));
    const freq = new Map();
    for (const a of arts) for (const t of titleTerms(a.title)) if (!known.has(t)) freq.set(t, (freq.get(t) || 0) + 1);
    // 키워드(내가 정한 것)도 단어로 함께 센다
    for (const [k, c] of kw) freq.set(k.toLowerCase(), (freq.get(k.toLowerCase()) || 0) + c);
    words = top(freq, 12).filter(([, c]) => c >= 2).slice(0, 6).map(([t, c]) => ({ text: t, count: c }));

    const prio = arts.filter((a) => a.priority).length;
    lines.push({ icon: "newspaper", parts: [`${label} 기사 ${arts.length}건 수집` + (prio ? ` · 감독·제재 성격 ${prio}건` : "")] });
  }
  const schedules = findSchedules([...arts, ...pressToday.map((p) => ({ ...p, summary: "" }))]);
  const lead = arts.filter((a) => isMajor(a.source, a.link)).sort((a, b) => b.at - a.at).slice(0, 6);
  return { label, lines: lines.slice(0, 4), words, schedules, lead, total: arts.length };
}
