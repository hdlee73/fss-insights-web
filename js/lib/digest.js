// 오늘의 금융감독 브리핑 요약: 외부 AI 없이, 수집된 기사·보도자료를 규칙으로 묶어 3~5줄로 정리한다.
// (키워드별 기사 수 → 제목 속 자주 나온 말 → 감독·제재 기사 → 금융당국 보도자료 → 주요 출처)
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
    const hot = top(freq, 8).filter(([, c]) => c >= 2).slice(0, 4);
    if (hot.length) {
      const p = ["제목에 자주 등장한 말: "];
      hot.forEach(([t, c], i) => p.push(i ? " · " : "", { text: `${t}(${c})`, q: t }));
      lines.push({ icon: "activity", parts: p });
    }

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
  return { label, lines: lines.slice(0, 5), total: arts.length };
}
