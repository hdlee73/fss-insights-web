// 이 브라우저(localStorage)에만 있는 설정·보관함을 JSON 파일로 내보내고 다시 가져온다(기기 바꿈·PC↔휴대폰 이어 보기).
// 접속 통계 식별값·날씨 오류 기록처럼 기기에 묶인 값과 일시적인 값은 담지 않는다.
import { APP_NAME, APP_VERSION, dialog, download, h, toast } from "../core.js";

const PREFIX = "fss.";
const KIND = "fss-insights-backup";
const SKIP = [/^usage/, /^weather\./, /^seen\./, /^updated$/, /^emg\./, /^alerts\.lastCheck$/, /^alerts\.briefingDay$/, /^disclaimer\./, /^dart\.seen$/, /^read\.links$/];
const skipped = (key) => SKIP.some((r) => r.test(key));

/** 담을 수 있는 항목 { key: 값 } */
export function collect() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX) || skipped(k.slice(PREFIX.length))) continue;
      try {
        out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
      } catch {
        /* 글자로 저장된 값은 건너뜀 */
      }
    }
  } catch {
    /* 저장소를 못 읽는 브라우저 */
  }
  return out;
}

const LABELS = [
  [/^dart\.watch$/, "관심기업"], [/^vault\.notes$|^news\.bookmarks$|^savedReleases$/, "보관함(스크랩·메모)"], [/^alerts\./, "알림 설정"],
  [/^news\./, "뉴스 설정"], [/^law\./, "법령검색 즐겨찾기·기록"], [/^menu\./, "메뉴 즐겨찾기·접기"], [/^market\./, "시장 지표 설정"], [/^fisis\./, "금융회사 비교 선택"],
  [/^sites$|^institutes$/, "주요사이트·기관"], [/^sims?$|^sim\./, "시뮬레이터 저장"],
];
const labelOf = (key) => LABELS.find(([r]) => r.test(key))?.[1] || "기타 설정";

export function summary(data) {
  const n = {};
  for (const [k, v] of Object.entries(data)) {
    const c = Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 1;
    n[labelOf(k)] = (n[labelOf(k)] || 0) + c;
  }
  return Object.entries(n).map(([l, c]) => `${l} ${c}건`);
}

export function exportBackup() {
  const data = collect();
  const keys = Object.keys(data);
  if (!keys.length) return toast("내보낼 설정이 아직 없습니다.");
  const payload = { kind: KIND, app: APP_NAME, version: APP_VERSION, exportedAt: new Date().toISOString(), data };
  const day = payload.exportedAt.slice(0, 10).replace(/-/g, "");
  download(new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }), `FSS_Insights_백업_${day}.json`);
  toast(`설정 ${keys.length}개 항목을 내보냈어요`);
}

/** 파일 내용 검사 → { data } 또는 { error } */
export function parseBackup(text) {
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    return { error: "백업 파일(JSON)이 아니에요." };
  }
  if (o?.kind !== KIND || !o.data || typeof o.data !== "object" || Array.isArray(o.data)) return { error: "FSS Insights 백업 파일이 아니에요." };
  const data = {};
  for (const [k, v] of Object.entries(o.data)) if (/^[\w.:-]{1,80}$/.test(k) && !skipped(k)) data[k] = v;
  if (!Object.keys(data).length) return { error: "가져올 항목이 없어요." };
  return { data, exportedAt: o.exportedAt || "" };
}

/** 두 값을 합친다: 목록은 합집합(앞에 둔 쪽 우선), 객체는 키별로, 나머지는 가져온 값. */
export function mergeValue(cur, inc) {
  if (Array.isArray(cur) && Array.isArray(inc)) {
    const seen = new Set();
    return [...inc, ...cur].filter((x) => {
      const id = JSON.stringify(x);
      return seen.has(id) ? false : (seen.add(id), true);
    });
  }
  if (cur && inc && typeof cur === "object" && typeof inc === "object" && !Array.isArray(cur) && !Array.isArray(inc)) return { ...cur, ...inc };
  return inc;
}

export function applyBackup(data, mode) {
  let n = 0;
  for (const [k, v] of Object.entries(data)) {
    try {
      let cur = null;
      try { cur = JSON.parse(localStorage.getItem(PREFIX + k)); } catch { /* 없음 */ }
      localStorage.setItem(PREFIX + k, JSON.stringify(mode === "merge" && cur != null ? mergeValue(cur, v) : v));
      n++;
    } catch {
      /* 저장 공간 부족 */
    }
  }
  return n;
}

/** 파일 고르기 → 내용 확인 창 → 반영. 반영했으면 true. */
export async function importBackup(file) {
  const r = parseBackup(await file.text());
  if (r.error) return toast(r.error), false;
  const radio = (v, label, on) => h("label", { class: "lw-opt" }, h("input", { type: "radio", name: "_bk", value: v, checked: on }), label);
  const body = h("div", { class: "lw-save" },
    h("p", { class: "note" }, `${r.exportedAt ? r.exportedAt.slice(0, 10) + "에 내보낸 " : ""}백업 파일입니다. 들어 있는 항목: ${summary(r.data).join(", ")}`),
    radio("merge", "지금 이 기기의 내용과 합치기 (목록은 합집합, 권장)", true),
    radio("replace", "이 기기의 같은 항목을 백업 내용으로 바꾸기", false));
  if (!(await dialog({ title: "백업 가져오기", body, ok: "가져오기", cancel: "취소" }))) return false;
  const n = applyBackup(r.data, body.querySelector('input[name="_bk"]:checked').value);
  toast(`${n}개 항목을 가져왔어요. 화면을 새로 고칩니다.`);
  setTimeout(() => location.reload(), 900);
  return true;
}
