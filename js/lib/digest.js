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
const SCHED = /간담회|방문|참석|주재|면담|회동|회의|만나|현장|취임|출범|토론|특강|국정감사|국감|업무보고|기자간담|세미나|포럼|행사|점검|발표|개최|예정|오전|오후|내일|이날/;
/** 기사·보도자료 제목에서 원장·위원장 일정으로 보이는 것(최근 순, 최대 4건). */
export function findSchedules(items) {
  const out = [];
  const seen = new Set();
  for (const a of items || []) {
    const t = a.title || "";
    const who = WHO.find(([re]) => re.test(t));
    if (!who || !SCHED.test(`${t} ${a.summary || ""}`.slice(0, 200))) continue;
    const key = who[1] + t.replace(/[^가-힣a-zA-Z0-9]/g, "").slice(0, 14);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ who: who[1], title: t, href: a.link, source: a.source || a.label || "", at: a.at || (a.date ? Date.parse(a.date) : 0) });
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 4);
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
    const parts = [`${label} 기사 ${arts.length}건 수집(30대 언론 ${major}건).`];
    if (topKw.length) {
      parts.push(" 가장 많이 다뤄진 키워드는 ");
      topKw.forEach(([k, c], i) => parts.push(i ? ", " : "", { text: `${k} ${c}건`, q: k }));
      parts.push("입니다.");
    }
    lines.push({ icon: "newspaper", parts });

    // 2) 제목 속 자주 나온 말(키워드와 겹치지 않는 것)
    const known = new Set([...kw.keys()].flatMap((k) => k.toLowerCase().split(/\s+/)));
    const freq = new Map();
    for (const a of arts) for (const t of titleTerms(a.title)) if (!known.has(t)) freq.set(t, (freq.get(t) || 0) + 1);
    // 키워드(내가 정한 것)도 단어로 함께 센다
    for (const [k, c] of kw) freq.set(k.toLowerCase(), (freq.get(k.toLowerCase()) || 0) + c);
    words = top(freq, 12).filter(([, c]) => c >= 2).slice(0, 8).map(([t, c]) => ({ text: t, count: c }));

    // 3) 감독·제재 관련(검사·제재·과징금 등이 2개 이상 겹친 기사)
    const prio = arts.filter((a) => a.priority).sort((a, b) => b.at - a.at);
    if (prio.length) {
      const a = prio[0];
      lines.push({ icon: "gavel", parts: [`감독·제재 성격의 기사 ${prio.length}건. 대표 기사: `, { text: `‘${clip(a.title)}’`, href: a.link }, ` (${String(a.source || "").slice(0, 12)})`] });
    }
  }

  // 4) 금융당국 보도자료
  if (pressToday.length) {
    const p = pressToday[0];
    lines.push({ icon: "file-text", parts: [`금융당국 보도자료 ${pressToday.length}건(어제~오늘). 최신: `, { text: `‘${clip(p.title, 42)}’`, href: p.link }, p.label ? ` (${p.label})` : ""] });
  }

  // 5) 주요 출처
  if (arts.length >= 5 && lines.length < 5) {
    const src = new Map();
    for (const a of arts) {
      const s = String(a.source || "").slice(0, 12);
      if (s) src.set(s, (src.get(s) || 0) + 1);
    }
    const t = top(src, 3);
    if (t.length >= 2) lines.push({ icon: "globe", parts: ["기사를 많이 낸 곳: " + t.map(([s, c]) => `${s} ${c}건`).join(" · ")] });
  }
  const schedules = findSchedules([...arts, ...pressToday.map((p) => ({ ...p, summary: "" }))]);
  const lead = arts.filter((a) => isMajor(a.source, a.link)).sort((a, b) => b.at - a.at).slice(0, 6);
  return { label, lines: lines.slice(0, 4), words, schedules, lead, total: arts.length };
}
