// 과징금·양정 모의계산(안드로이드 회계 앱 domain/*.kt를 그대로 옮김). 화면과 떨어진 순수 함수라 node로 시험할 수 있다.
// 시행세칙 [별표 1] 심사·감리결과 조치양정기준 + 외감규정 [별표 8] 과징금 부과기준. 참고용 비공식 계산이다.

// ---------------------------------------------------------------- 열거형(저장 파일에는 이름을 그대로 쓴다: 앱과 호환)

export const ScaleBasis = {
  AVG: { label: "자산·매출 평균" },
  ASSET: { label: "자산총계" },
  SALES: { label: "매출액" },
};
export const VType = {
  A: { label: "A 당기손익·자기자본에 영향", short: "A", pct: 1, audMul: 1, basis: "AVG" },
  B: { label: "B 자산·부채·수익·비용 과대/과소 등(손익 영향 없음)", short: "B", pct: 4, audMul: 4, basis: "ASSET" },
  C: { label: "C 특수관계자·보증·소송 주석", short: "C", pct: 5, audMul: 5, basis: "AVG" },
  D: { label: "D 기타 주석·계정분류", short: "D", pct: 15, audMul: 15, basis: "AVG" },
};
export const CompanyKind = {
  KOSPI: { label: "유가증권시장 상장", listed: true },
  KOSDAQ: { label: "코스닥 상장", listed: true },
  KONEX: { label: "코넥스 상장", listed: true },
  REPORTING: { label: "사업보고서 제출 비상장", listed: false },
  LARGE_UNLISTED: { label: "대형 비상장주식회사", listed: false },
  OTHER: { label: "그 밖의 비상장", listed: false },
};
export const Motive = { INTENT: { label: "고의" }, GROSS_NEGLIGENCE: { label: "중과실" }, NEGLIGENCE: { label: "과실" } };
export const Level = { HIGH: { label: "상", points: 3 }, MID: { label: "중", points: 2 }, LOW: { label: "하", points: 1 } };
const MOTIVES = Object.keys(Motive);
const VTYPES = Object.keys(VType);

// ---------------------------------------------------------------- 금액 표시

export const Format = {
  /** 원 → "31.6억원" 같은 한글 단위 */
  won(v) {
    if (v == null || Number.isNaN(v)) return "-";
    const a = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    const trim = (x) => (x >= 100 ? x.toLocaleString("ko-KR", { maximumFractionDigits: 0 }) : x.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })).replace(/\.0$/, "");
    if (a >= 1e12) return sign + trim(a / 1e12) + "조원";
    if (a >= 1e8) return sign + trim(a / 1e8) + "억원";
    if (a >= 1e4) return sign + Math.round(a / 1e4).toLocaleString("ko-KR") + "만원";
    return sign + Math.round(a).toLocaleString("ko-KR") + "원";
  },
  /** 입력창 "1,234.5"(억원) → 원. 비었거나 잘못되면 null */
  eokToWon(text) {
    const t = String(text ?? "").replace(/,/g, "").trim();
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    const v = Number(t);
    if (!(v >= 0) || v > 100_000_000) return null; // 1경원까지(대형사 자산도 입력 가능)
    return Math.round(v * 1e8);
  },
  dateYmd: (s) => (/^\d{8}$/.test(s || "") ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : s || ""),
};
const f2 = (x) => x.toFixed(2);

// ---------------------------------------------------------------- 양정(시행세칙 [별표 1])

// (구간 최소 억원, 기본계수, 보간율)
const BANDS = [
  [0, 0.4, 0], [100, 0.6, 0.001], [300, 0.8, 0.0005], [700, 1.0, 0.00066667],
  [1000, 1.2, 0.0003], [2000, 1.5, 0.0001], [5000, 1.8, 0.00006], [10000, 2.1, 0.00003],
  [20000, 2.4, 0.00002], [50000, 3.0, 0.000012], [100000, 3.6, 0.000007],
  [200000, 4.3, 0.00000233], [500000, 5.0, 0.000004], [1000000, 7.0, 0.000003], [2000000, 10.0, 0],
];
const SCORE = {
  INTENT: [4, 6, 8, 10, 11, 12, 12],
  GROSS_NEGLIGENCE: [1, 1, 2, 4, 6, 8, 10],
  NEGLIGENCE: [0, 0.2, 0.3, 0.5, 2, 4, 6],
};
const BONUS = { INTENT: 0.02, GROSS_NEGLIGENCE: 0.01, NEGLIGENCE: 0 };
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

export const Yangjeong = {
  coefficient(eok) {
    const b = BANDS.filter((x) => eok >= x[0]).at(-1);
    return b[2] === 0 ? b[1] : b[1] + b[2] * (eok - b[0]);
  },
  /** 규모금액(원). <표1> 마. = 다 ÷ 라 */
  scaleAmountWon(c, basis) {
    const base = basis === "ASSET" ? c.assetWon : basis === "SALES" ? c.salesWon : (c.assetWon + c.salesWon) / 2;
    if (base <= 0) return 0;
    const eok = base / 1e8;
    let k = Yangjeong.coefficient(eok);
    const listed = CompanyKind[c.kind].listed;
    if ((listed || c.financial) && eok < 700) k = 1.0;
    if (c.halfCoefficient && !listed && !c.financial) k *= 0.5;
    return Math.trunc(base / k);
  },
  thresholdWon(c, v, matWon) {
    return matWon != null && matWon > 0 ? matWon * VType[v.type].audMul : (Yangjeong.scaleAmountWon(c, v.basis) * VType[v.type].pct) / 100;
  },
  /** 위법동기별 규모배수. D유형은 6배 제한 */
  multiples(c, items, matWon) {
    const out = {};
    for (const m of MOTIVES) {
      let sum = 0;
      for (const t of VTYPES) {
        const rows = items.filter((r) => r.motive === m && r.type === t);
        if (!rows.length) continue;
        let tm = rows.reduce((s, r) => {
          const th = Yangjeong.thresholdWon(c, r, matWon);
          return s + (th > 0 ? r.amountWon / th : 0);
        }, 0);
        if (t === "D") tm = Math.min(tm, 6);
        sum += tm;
      }
      if (sum > 0) out[m] = sum;
    }
    return out;
  },
  ladderIndex: (x) => (x >= 16 ? 5 : x >= 8 ? 4 : x >= 4 ? 3 : x >= 2 ? 2 : x >= 1 ? 1 : null),
  gradeLabel: (i) => ["감경시 최소", "Ⅴ", "Ⅳ", "Ⅲ", "Ⅱ", "Ⅰ"][i] ?? "가중시 최대",
  score: (m, idx) => SCORE[m][clamp(idx, 0, 6)] + BONUS[m],
  stepLabel: (s) => `${Motive[s.motive].label} ${Yangjeong.gradeLabel(s.idx)}`,

  assess(c, items, matWon, netSteps) {
    const notes = [];
    const mult = Yangjeong.multiples(c, items, matWon);
    const per = Object.fromEntries(Object.entries(mult).map(([m, x]) => [m, Yangjeong.ladderIndex(x)]));
    const sc = (s) => Yangjeong.score(s.motive, s.idx);
    const best = (list) => list.reduce((b, s) => (b == null || sc(s) > sc(b) ? s : b), null);
    const before = best(Object.entries(per).filter(([, i]) => i != null).map(([motive, idx]) => ({ motive, idx })));
    let converted = {};
    let after = before;
    const mi = mult.INTENT || 0;
    const mg = mult.GROSS_NEGLIGENCE || 0;
    if (mi > 0 && mg > 0) {
      converted = { INTENT: mi + mg / 8, GROSS_NEGLIGENCE: mi * 8 + mg };
      const post = Object.entries(converted).map(([motive, x]) => ({ motive, idx: Yangjeong.ladderIndex(x) })).filter((s) => s.idx != null);
      const bp = best(post);
      if (before && bp && sc(bp) > sc(before)) {
        const limit = { motive: before.motive, idx: Math.min(before.idx + 1, 6) };
        after = sc(bp) <= sc(limit) ? bp : limit;
        notes.push("위법동기가 둘 이상(고의·중과실)이라 <표2>에 따라 환산 후 조치와 비교했고, 환산 전보다 1단계를 넘지 않도록 제한했습니다.");
      }
    }
    const base = after;
    const final = base ? { motive: base.motive, idx: clamp(base.idx + netSteps, 0, 6) } : null;
    const finalMultiple = mi + mg + (mult.NEGLIGENCE || 0);
    if (!before && Object.keys(mult).length) notes.push("위반금액이 중요성 기준금액의 1배 미만이라 양정표(Ⅴ 이상) 대상이 아닙니다.");
    return { multiples: mult, perMotive: per, converted, before, after, base, final, netSteps, finalMultiple, fineMultiple: mi + mg, notes };
  },
};

// ---------------------------------------------------------------- 조치표(시행세칙 [별표 1] Ⅴ.) 인덱스 0=감경시 최소, 1=Ⅴ … 5=Ⅰ, 6=가중시 최대

const l = (s) => s.split("/").map((x) => x.trim());
const COMPANY_I = l("과징금 또는 증권발행제한 12월(회사)/과징금(회사 관계자)/감사인지정 3년/대표이사 및 담당임원 해임(면직)권고/감사(감사위원) 해임권고/직무정지 6월 이내/회사(임직원 포함) 수사기관 고발");
const AUD_INTENT_I = l("과징금/손해배상공동기금 추가적립 100%/당해회사 감사업무제한 5년");
const CPA_INTENT_I = l("등록취소건의/당해회사 감사업무제한 5년/주권상장·지정회사·대형비상장주식회사 감사업무제한 1년/직무연수 20시간/수사기관 고발");

export const ActionTables = {
  company: {
    INTENT: [
      l("과징금 또는 증권발행제한 4월(회사)/과징금(회사 관계자)/감사인지정 2년"),
      l("과징금 또는 증권발행제한 6월(회사)/과징금(회사 관계자)/감사인지정 2년/담당임원 해임(면직)권고/직무정지 6월 이내/회사(임직원 포함) 수사기관 통보"),
      l("과징금 또는 증권발행제한 8월(회사)/과징금(회사 관계자)/감사인지정 2년/담당임원 해임(면직)권고/감사(감사위원) 해임권고/직무정지 6월 이내/회사(임직원 포함) 수사기관 통보"),
      l("과징금 또는 증권발행제한 10월(회사)/과징금(회사 관계자)/감사인지정 3년/담당임원 해임(면직)권고/감사(감사위원) 해임권고/직무정지 6월 이내/회사(임직원 포함) 수사기관 통보"),
      l("과징금 또는 증권발행제한 11월(회사)/과징금(회사 관계자)/감사인지정 3년/대표이사 및 담당임원 해임(면직)권고/감사(감사위원) 해임권고/직무정지 6월 이내/회사(임직원 포함) 수사기관 고발"),
      COMPANY_I, COMPANY_I,
    ],
    GROSS_NEGLIGENCE: [
      l("증권발행제한 1월"),
      l("과징금 또는 증권발행제한 1월(회사)/과징금(회사 관계자)/감사인지정 1년"),
      l("과징금 또는 증권발행제한 2월(회사)/과징금(회사 관계자)/감사인지정 1년"),
      l("과징금 또는 증권발행제한 4월(회사)/과징금(회사 관계자)/감사인지정 2년"),
      l("과징금 또는 증권발행제한 6월(회사)/과징금(회사 관계자)/감사인지정 2년/담당임원 해임(면직)권고/감사(감사위원) 해임권고/직무정지 6월 이내"),
      l("과징금 또는 증권발행제한 8월(회사)/과징금(회사 관계자)/감사인지정 2년/담당임원 해임(면직)권고/감사(감사위원) 해임권고/직무정지 6월 이내"),
      l("과징금 또는 증권발행제한 10월(회사)/과징금(회사 관계자)/감사인지정 3년/담당임원 해임(면직)권고/감사(감사위원) 해임권고/직무정지 6월 이내"),
    ],
    NEGLIGENCE: [
      l("조치없음"), l("주의"), l("주의"), l("경고"),
      l("증권발행제한 2월/감사인지정 1년"), l("증권발행제한 4월/감사인지정 2년"),
      l("증권발행제한 6월/감사인지정 2년/담당임원 해임(면직)권고/직무정지 6월 이내"),
    ],
  },
  auditor: {
    INTENT: [
      l("과징금/손해배상공동기금 추가적립 30%/당해회사 감사업무제한 2년"),
      l("과징금/손해배상공동기금 추가적립 50%/당해회사 감사업무제한 3년"),
      l("과징금/손해배상공동기금 추가적립 70%/당해회사 감사업무제한 3년"),
      l("과징금/손해배상공동기금 추가적립 80%/당해회사 감사업무제한 4년"),
      l("과징금/손해배상공동기금 추가적립 90%/당해회사 감사업무제한 4년"),
      AUD_INTENT_I, AUD_INTENT_I,
    ],
    GROSS_NEGLIGENCE: [
      l("손해배상공동기금 추가적립 10%"),
      l("과징금/손해배상공동기금 추가적립 10%/당해회사 감사업무제한 1년"),
      l("과징금/손해배상공동기금 추가적립 20%/당해회사 감사업무제한 2년"),
      l("과징금/손해배상공동기금 추가적립 30%/당해회사 감사업무제한 2년"),
      l("과징금/손해배상공동기금 추가적립 50%/당해회사 감사업무제한 3년"),
      l("과징금/손해배상공동기금 추가적립 70%/당해회사 감사업무제한 3년"),
      l("과징금/손해배상공동기금 추가적립 80%/당해회사 감사업무제한 4년"),
    ],
    NEGLIGENCE: [
      l("조치 없음"), l("주의"), l("주의"), l("경고"),
      l("손해배상공동기금 추가적립 20%/당해회사 감사업무제한 2년"),
      l("손해배상공동기금 추가적립 30%/당해회사 감사업무제한 2년"),
      l("손해배상공동기금 추가적립 50%/당해회사 감사업무제한 3년"),
    ],
  },
  cpa: {
    INTENT: [
      l("당해회사 감사업무제한 2년/주권상장·지정회사 감사업무제한 1년/직무연수 8시간"),
      l("직무일부정지건의 6월/당해회사 감사업무제한 3년/주권상장·지정회사·대형비상장주식회사 감사업무제한 1년/직무연수 12시간/수사기관 통보"),
      l("직무정지건의 6월/당해회사 감사업무제한 4년/주권상장·지정회사·대형비상장주식회사 감사업무제한 1년/직무연수 16시간/수사기관 통보"),
      l("직무정지건의 1년/당해회사 감사업무제한 5년/주권상장·지정회사·대형비상장주식회사 감사업무제한 1년/직무연수 16시간/수사기관 통보"),
      l("직무정지건의 2년/당해회사 감사업무제한 5년/주권상장·지정회사·대형비상장주식회사 감사업무제한 1년/직무연수 20시간/수사기관 고발"),
      CPA_INTENT_I, CPA_INTENT_I,
    ],
    GROSS_NEGLIGENCE: [
      l("지정회사 감사업무제한 1년/직무연수 2시간"),
      l("당해회사 감사업무제한 1년/지정회사 감사업무제한 1년/직무연수 4시간"),
      l("당해회사 감사업무제한 1년/주권상장(코스닥·코넥스 제외)·지정회사 감사업무제한 1년/직무연수 6시간"),
      l("당해회사 감사업무제한 2년/주권상장·지정회사 감사업무제한 1년/직무연수 8시간"),
      l("직무일부정지건의 6월/당해회사 감사업무제한 3년/주권상장·지정회사·대형비상장주식회사 감사업무제한 1년/직무연수 12시간"),
      l("직무정지건의 1년/당해회사 감사업무제한 4년/주권상장·지정회사·대형비상장주식회사 감사업무제한 1년/직무연수 16시간"),
      l("직무정지건의 2년/당해회사 감사업무제한 5년/주권상장·지정회사·대형비상장주식회사 감사업무제한 1년/직무연수 16시간"),
    ],
    NEGLIGENCE: [
      l("조치없음"), l("주의"), l("주의"), l("경고/직무연수 2시간"),
      l("당해회사 감사업무제한 1년/지정회사 감사업무제한 1년/직무연수 6시간"),
      l("당해회사 감사업무제한 2년/주권상장(코스닥·코넥스 제외)·지정회사 감사업무제한 1년/직무연수 8시간"),
      l("당해회사 감사업무제한 3년/주권상장·지정회사 감사업무제한 1년/직무연수 12시간"),
    ],
  },
  lookup: (table, step) => table[step.motive][clamp(step.idx, 0, 6)],
};

// ---------------------------------------------------------------- 가중·감경 사유(시행세칙 [별표 1] Ⅵ.) + 과징금 조정 구분(외감규정 [별표 8])

const R = (id, label, steps, fine, hint = "") => ({ id, label, steps, fine, hint });
export const Reasons = {
  companyUp: [
    R("c_repeat", "재위반: 과실 조치 후 3년 내 / 고의·중과실 조치 후 5년 내 고의·중과실 위반", 1, "UP50"),
    R("c_period", "위반기간 3개 사업연도 초과 (고의)", 1, "UP_YEARS"),
    R("c_false", "감리·심사 시 허위자료 제출·자료제출 거부 또는 감사 방해", 1, "UP50"),
    R("c_icfr", "내부회계관리제도 중요한 취약사항", 1, "UP20"),
    R("c_harm", "다수 이해관계자에게 중대한 손해·사회적 물의", 1, "UP50"),
    R("c_turn", "정정 시 당기손실→이익 반전 또는 완전자본잠식 (고의 제외)", 1, "UP50"),
    R("c_64", "최종 규모배수 64배 이상", 1, "UP50", "배수가 64배 이상이면 자동 반영"),
    R("c_norm", "그 밖에 통념상 위법행위에 비해 조치 수준이 낮은 경우", 1, "UP_FREE"),
  ],
  companyDown: [
    R("c_small", "소규모: 직전 사업연도 말 자산 또는 3개년 평균 매출 1,000억원 미만(상장·대형비상장·금융 제외)", 1, "DOWN50"),
    R("c_comp", "투자자 등 이해관계자 피해를 충분히 보상", 1, "DOWN50"),
    R("c_report", "외감법 제28조 사실을 증권선물위원회에 신고하거나 감사(위원회)·감사인에게 고지", 1, "DOWN50", "요건을 모두 갖추면 2단계 감경 가능(아래 별도 선택)"),
    R("c_report2", "위 신고·고지 요건 3가지(주도 안 함·정보 미입수·증거 제공)를 모두 갖춤 (추가 1단계)", 1, "NONE"),
    R("c_pre", "심사·감리 통지 前 자진 수정공시", 1, "DOWN70_FINAL", "위법동기가 과실이면 2단계"),
    R("c_post", "통지 후 1개월 내 자진 수정공시", 1, "DOWN30"),
    R("c_ifrs", "K-IFRS 도입 전후 회계처리 차이로 인한 위반 (비고의)", 1, "DOWN30"),
    R("c_sp", "원인·결과·방법상 정상을 특별히 참작할 사유", 2, "DOWN30"),
    R("c_value", "밸류업 우수기업 선정 장관급 이상 표창 (고의 제외)", 2, "NONE"),
    R("c_ability", "위반자의 현실적 부담능력 등을 고려할 필요", 1, "NONE"),
  ],
  auditorUp: [
    R("a_period", "위반기간 3개 사업연도 초과 (고의)", 1, "UP_YEARS"),
    R("a_false", "위법행위 은폐·축소를 위한 허위자료 제출·자료 거부", 1, "UP50"),
    R("a_64", "최종 규모배수 64배 이상", 1, "UP50", "배수가 64배 이상이면 자동 반영"),
    R("a_norm", "그 밖에 통념상 조치 수준이 낮은 경우", 1, "UP_FREE"),
  ],
  auditorDown: [
    R("a_small", "소규모: 회사의 자산 또는 3개년 평균 매출 1,000억원 미만(상장·대형비상장·금융 제외)", 1, "DOWN50"),
    R("a_qc", "품질관리기준을 충실히 이행하였다고 판단(품질관리 감리 결과)", 1, "NONE"),
    R("a_comp", "이해관계자 피해를 충분히 보상", 1, "DOWN50"),
    R("a_report", "외감법 제28조 사실을 신고하거나 고지", 1, "DOWN50"),
    R("a_help", "회사의 자진 수정공시를 사전에 적극 조력한 사실이 서류로 인정", 1, "DOWN30"),
    R("a_reissue", "회사에 수정공시를 권고했으나 거부되어 감사의견 변경 후 감사보고서 재발행", 1, "DOWN30"),
    R("a_ifrs", "K-IFRS 도입 전후 회계처리 차이로 인한 위반 (비고의)", 1, "DOWN30"),
    R("a_sp", "원인·결과·방법상 정상을 특별히 참작할 사유", 2, "DOWN30"),
    R("a_ability", "위반자의 현실적 부담능력 등을 고려할 필요", 1, "NONE"),
  ],
  netSteps(sel, up, down, auto64, motive) {
    const ups = up.filter((r) => sel.includes(r.id) || (auto64 && r.id.endsWith("_64"))).reduce((s, r) => s + r.steps, 0);
    const downs = down.filter((r) => sel.includes(r.id)).reduce((s, r) => s + (r.id === "c_pre" && motive === "NEGLIGENCE" ? 2 : r.steps), 0);
    return ups - downs;
  },
};

// ---------------------------------------------------------------- 과징금(외감규정 [별표 8])

const EOK = 100_000_000;
const trimPct = (d) => (Number.isInteger(d) ? String(d) : d.toFixed(1));
const cut = (won) => Math.floor(won / 100_000) * 100_000; // 10만원 미만 절사

export const FineModel = {
  /** 중요도 점수 → [회사 부과기준율 %, 감사인·회사관계자 부과기준율 %] */
  rate: (s) => (s >= 2.6 ? [20, 500] : s >= 2.4 ? [15, 350] : s >= 2.2 ? [12.5, 300] : s >= 2.0 ? [10, 250] : s >= 1.8 ? [7.5, 200] : s >= 1.6 ? [5, 150] : s >= 1.4 ? [3.5, 100] : [2, 50]),
  sizeLevel: (m) => (m >= 16 ? "HIGH" : m >= 8 ? "MID" : "LOW"),
  kindLevel: (k) => (k === "KOSPI" || k === "KOSDAQ" ? "HIGH" : k === "OTHER" ? "LOW" : "MID"),
  /** 점수 = Σ(항목 점수 × 가중치). 중과실이면 모든 항목을 '하(1점)'로 본다. */
  score(content, size, kind, market, motive) {
    const gross = motive === "GROSS_NEGLIGENCE";
    const p = (lv) => (gross ? 1 : Level[lv].points);
    const lb = (lv) => (gross ? "하" : Level[lv].label);
    const s = p(content) * 0.4 + p(size) * 0.2 + p(kind) * 0.2 + p(market) * 0.2;
    return {
      score: Math.round(s * 100) / 100,
      lines: [
        `위법행위 내용 ${lb(content)}(${p(content)}점) × 0.4`,
        `위반 규모 ${lb(size)}(${p(size)}점) × 0.2`,
        `회사 유형 ${lb(kind)}(${p(kind)}점) × 0.2`,
        `시장에 미치는 영향 ${lb(market)}(${p(market)}점) × 0.2` + (gross ? "  ※중과실: 전 항목 '하'" : ""),
      ],
    };
  },
  compute(i) {
    const lines = [];
    const basic = i.basicWon;
    lines.push(`① 기본과징금 = ${i.basicNote} = ${Format.won(basic)}`);
    let add = 0;
    if (i.upIds.has("UP50")) (add += basic * 0.5, lines.push(`  가중(재위반·방해·손해 등) +50% 이하 → +${Format.won(Math.trunc(basic * 0.5))}`));
    if (i.upIds.has("UP20")) (add += basic * 0.2, lines.push(`  가중(내부회계 취약) +20% 이하 → +${Format.won(Math.trunc(basic * 0.2))}`));
    if (i.upIds.has("UP_FREE") && i.upFreePct > 0) {
      const a = (basic * i.upFreePct) / 100;
      add += a;
      lines.push(`  가중(통념상 부족) +${i.upFreePct}% → +${Format.won(Math.trunc(a))}`);
    }
    if (i.upIds.has("UP_YEARS")) {
      const unit = i.motive === "INTENT" ? 0.3 : 0.2;
      const over = i.motive === "INTENT" ? i.years - 1 : i.years - 2;
      if (over > 0) {
        const a = Math.min(basic * unit * over, basic * i.years);
        add += a;
        lines.push(`  가중(위반 사업연도 초과) 기본과징금의 ${Math.round(unit * 100)}% × ${over}개 사업연도 → +${Format.won(Math.trunc(a))}`);
      }
    }
    if (i.contentHigh) {
      const deduct = i.isCompanyRate ? 0.1 : 2.5;
      const a = Math.min(Math.max(basic - i.baseWon * deduct, 0), basic / 2);
      if (a > 0) (add += a, lines.push(`  가중(위법행위 내용 중요도 '상'): 기본과징금 − 기준금액×${trimPct(deduct * 100)}% 범위, 기본과징금의 1/2 이내 → +${Format.won(Math.trunc(a))}`));
    }
    const aggravated = basic + Math.trunc(add);
    if (add > 0) lines.push(`② 가중 후 = ${Format.won(aggravated)}`);
    let down = 0;
    if (i.downs.has("DOWN50")) down += 0.5;
    if (i.downs.has("DOWN30")) down += 0.3;
    if (i.downFreePct > 0) down += i.downFreePct / 100;
    down = Math.min(down, 1);
    const reduced = Math.trunc(aggravated * (1 - down));
    if (down > 0) lines.push(`③ 감경 ${trimPct(Math.round(down * 1000) / 10)}% 이하 적용(최대치 가정) → ${Format.won(reduced)}`);
    let decided = reduced;
    if (i.downs.has("DOWN70_FINAL")) {
      decided = Math.trunc(reduced * 0.3);
      lines.push(`④ 결정금액 감면(자진 수정공시 등) 70% 이하 감경 가정 → ${Format.won(decided)}`);
    }
    let capped = false;
    if (i.statutoryCapWon != null && decided > i.statutoryCapWon) {
      decided = i.statutoryCapWon;
      capped = true;
      lines.push(`⑤ 법정 상한 ${Format.won(i.statutoryCapWon)} 초과분 제한`);
    }
    decided = cut(decided);
    let after = decided;
    const c = i.capmFineWon;
    if (c != null) {
      if (c >= decided) (after = 0, lines.push(`⑥ 자본시장법 과징금 ${Format.won(c)} ≥ 산정액 → 외감법 과징금을 부과하지 않을 수 있음`));
      else if (c > 0) (after = cut(decided - c), lines.push(`⑥ 자본시장법 과징금 ${Format.won(c)} 부과분 공제 → 차액 ${Format.won(after)}만 부과`));
    }
    return { basic, aggravated, reducedBeforeFinal: reduced, decided, afterCapm: after, capped, lines };
  },
  /** 자본시장법 제429조제3항 상한(참고): 일평균거래금액의 10%를 10억~20억원으로 제한, 거래 없으면 20억원 */
  capm429: (avg, traded = true) => (!traded || avg == null ? 20 * EOK : clamp(Math.trunc(avg / 10), 10 * EOK, 20 * EOK)),
};

// ---------------------------------------------------------------- 양정 대상자(회사·임직원·감사인·공인회계사)

export const ActorKind = {
  COMPANY: { label: "회사", companySide: true },
  OFFICER: { label: "임직원", companySide: true },
  AUDITOR: { label: "감사인", companySide: false },
  CPA: { label: "공인회계사", companySide: false },
};
const KIND_ORDER = Object.keys(ActorKind);
export const COMPANY_ID = 1;
export const defaultMotive = (kind) => (ActorKind[kind].companySide ? "INTENT" : "GROSS_NEGLIGENCE");
export const newActor = (id, kind, name = "") => ({ id, kind, name, reasons: [], content: ActorKind[kind].companySide ? "MID" : "LOW", benefitEok: "", feeEok: "", upFreePct: 0, downFreePct: 0 });
export const actorTitle = (a) => a.name.trim() || ActorKind[a.kind].label;
export const defaultActors = () => [newActor(1, "COMPANY", "회사"), newActor(4, "OFFICER", "임직원 1"), newActor(2, "AUDITOR", "감사인"), newActor(3, "CPA", "공인회계사 1")];
export const defaultAssign = (actors) => Object.fromEntries(actors.map((a) => [a.id, defaultMotive(a.kind)]));
export const sortedActors = (actors) => [...actors].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

// ---------------------------------------------------------------- 입력값 묶음과 전체 계산

let rowSeq = 1;
export const newRow = (id = rowSeq++, actors = defaultActors()) => ({ id, type: "A", basis: "AVG", amountEok: "", assign: defaultAssign(actors), title: "" });
export function defaultSettings() {
  const actors = defaultActors();
  return {
    kind: "KOSDAQ", financial: false, halfCoefficient: false, assetEok: "", salesEok: "", materialityEok: "",
    rows: [newRow(1, actors)], actors, marketImpact: "LOW", years: 1, capmEok: "",
  };
}

const pick = (v, obj, d) => (Object.hasOwn(obj, v) ? v : d);
const str = (v) => (v == null ? "" : String(v));
const strs = (v) => (Array.isArray(v) ? v.map(String) : []);
const pct = (v) => (Number.isFinite(+v) ? Math.trunc(+v) : 0);

function actorsOf(arr) {
  const list = [];
  const seen = new Set();
  (Array.isArray(arr) ? arr : []).forEach((a, i) => {
    if (!a || typeof a !== "object") return;
    const kind = pick(a.kind, ActorKind, "OFFICER");
    const id = Number.isInteger(a.id) ? a.id : i + 1;
    if (seen.has(id)) return;
    seen.add(id);
    list.push({ id, kind, name: str(a.name), reasons: strs(a.reasons), content: pick(a.content, Level, ActorKind[kind].companySide ? "MID" : "LOW"), benefitEok: str(a.benefitEok), feeEok: str(a.feeEok), upFreePct: pct(a.upFreePct), downFreePct: pct(a.downFreePct) });
  });
  return list.some((a) => a.kind === "COMPANY") ? list : [newActor(COMPANY_ID, "COMPANY", "회사"), ...list.filter((a) => a.id !== COMPANY_ID)];
}

/** v0.3.0 이전 저장 파일(회사·임직원·감사인·공인회계사 한 묶음)을 대상자 목록으로 바꾼다. */
function legacyActors(o) {
  const cReasons = strs(o.companyReasons), aReasons = strs(o.auditorReasons);
  const up = pct(o.upFreePct), down = pct(o.downFreePct);
  const cc = pick(o.contentCompany, Level, "MID"), ac = pick(o.contentAuditor, Level, "LOW");
  const list = [
    { ...newActor(COMPANY_ID, "COMPANY", "회사"), reasons: cReasons, content: cc, upFreePct: up, downFreePct: down },
    { ...newActor(4, "OFFICER", "임직원 1"), reasons: cReasons, content: cc, benefitEok: str(o.officerBenefitEok), upFreePct: up, downFreePct: down },
  ];
  if (o.auditorOn ?? true) {
    list.push({ ...newActor(2, "AUDITOR", "감사인"), reasons: aReasons, content: ac, feeEok: str(o.auditFeeEok), upFreePct: up, downFreePct: down });
    list.push({ ...newActor(3, "CPA", "공인회계사 1"), reasons: aReasons, content: ac, upFreePct: up, downFreePct: down });
  }
  return list;
}

/** 앱·웹에서 저장한 설정을 읽는다. 모르는 값은 기본값으로 바꿔 이전·이후 버전과 호환한다. */
export function normalizeSettings(o = {}) {
  const d = defaultSettings();
  const hasActors = Array.isArray(o.actors);
  const actors = hasActors ? actorsOf(o.actors) : legacyActors(o);
  const rows = (Array.isArray(o.rows) ? o.rows : []).filter((r) => r && typeof r === "object").map((r, i) => {
    const type = pick(r.type, VType, "A");
    let assign = {};
    if (r.assign && typeof r.assign === "object") {
      for (const [k, v] of Object.entries(r.assign)) if (/^-?\d+$/.test(k) && Object.hasOwn(Motive, v)) assign[+k] = v;
    } else {
      const cm = pick(r.motive, Motive, "INTENT"), am = pick(o.auditorMotive, Motive, "GROSS_NEGLIGENCE");
      assign = Object.fromEntries(actors.map((a) => [a.id, ActorKind[a.kind].companySide ? cm : am]));
    }
    return { id: Number.isInteger(r.id) ? r.id : i + 1, type, basis: pick(r.basis, ScaleBasis, VType[type].basis), amountEok: str(r.amountEok), assign, title: str(r.title) };
  });
  return {
    kind: pick(o.kind, CompanyKind, d.kind), financial: !!o.financial, halfCoefficient: !!o.halfCoefficient,
    assetEok: str(o.assetEok), salesEok: str(o.salesEok), materialityEok: str(o.materialityEok),
    rows: rows.length ? rows : [newRow(1, actors)], actors,
    marketImpact: pick(o.marketImpact, Level, d.marketImpact), years: clamp(Math.trunc(+o.years) || 1, 1, 10), capmEok: str(o.capmEok),
  };
}

const fineUp = (sel, list, auto64) => new Set(list.filter((r) => sel.includes(r.id) || (auto64 && r.id.endsWith("_64"))).map((r) => r.fine));
const fineDown = (sel, list) => new Set(list.filter((r) => sel.includes(r.id)).map((r) => r.fine));

export function runSimulation(s) {
  const assetWon = Format.eokToWon(s.assetEok) ?? 0;
  const salesWon = Format.eokToWon(s.salesEok) ?? 0;
  const mw = Format.eokToWon(s.materialityEok);
  const matWon = mw > 0 ? mw : null;
  const valid = s.rows.map((r) => ({ row: r, won: Format.eokToWon(r.amountEok) })).filter((v) => v.won > 0);
  if (!valid.length) return { error: "위법행위 금액을 1건 이상 입력하세요 (억원)." };
  if (matWon == null && (assetWon <= 0 || (salesWon <= 0 && valid.some((v) => v.row.basis !== "ASSET")))) {
    return { error: "자산총계와 매출액(억원)을 입력하거나, 감사인의 중요성 금액을 입력하세요." };
  }
  const scale = { assetWon, salesWon, kind: s.kind, financial: s.financial, halfCoefficient: s.halfCoefficient };
  const scaleLines = [];
  if (matWon != null) scaleLines.push(`감사인 중요성 금액 ${Format.won(matWon)} 적용 (유형 배수 A 1배·B 4배·C 5배·D 15배)`);
  else for (const b of Object.keys(ScaleBasis)) {
    if (!valid.some((v) => v.row.basis === b)) continue;
    const amt = Yangjeong.scaleAmountWon(scale, b);
    const q = (p) => Format.won(Math.trunc((amt * p) / 100));
    scaleLines.push(`규모금액(${ScaleBasis[b].label} 기준) ${Format.won(amt)} → 표준 중요성 기준금액 A ${q(1)} · B ${q(4)} · C ${q(5)} · D ${q(15)}`);
  }
  const cw = Format.eokToWon(s.capmEok);
  const capmWon = cw > 0 ? cw : null;
  const actors = sortedActors(s.actors).map((a) => runActor(s, a, valid, scale, matWon, capmWon));
  return { error: null, scaleLines, actors, notes: ["고의·중과실이 혼재하면 과징금 중요도는 두 동기의 규모배수를 단순합산(<표2> 6.)해 위반 규모 항목을 판단합니다."] };
}

function runActor(s, a, valid, scale, matWon, capmWon) {
  const items = valid.filter((v) => a.id in v.row.assign || String(a.id) in v.row.assign).map((v) => ({ type: v.row.type, basis: v.row.basis, amountWon: v.won, motive: v.row.assign[a.id] }));
  if (!items.length) return { actor: a, rowCount: 0, assessment: null, actions: [], fine: null, note: "배정된 위반행위가 없습니다. 위반행위마다 이 대상자의 위법 동기를 고르세요." };
  const cs = ActorKind[a.kind].companySide;
  const up = cs ? Reasons.companyUp : Reasons.auditorUp;
  const down = cs ? Reasons.companyDown : Reasons.auditorDown;
  const first = Yangjeong.assess(scale, items, matWon, 0);
  const auto64 = first.finalMultiple >= 64;
  const net = Reasons.netSteps(a.reasons, up, down, auto64, first.base?.motive);
  const asm = Yangjeong.assess(scale, items, matWon, net);
  const table = a.kind === "AUDITOR" ? ActionTables.auditor : a.kind === "CPA" ? ActionTables.cpa : ActionTables.company;
  const actions = asm.final ? ActionTables.lookup(table, asm.final) : [];
  if (a.kind === "CPA") return { actor: a, rowCount: items.length, assessment: asm, actions, fine: null, note: "" };

  const fineItems = items.filter((x) => x.motive !== "NEGLIGENCE");
  if (!fineItems.length) return { actor: a, rowCount: items.length, assessment: asm, actions, fine: null, note: "모든 위법행위가 '과실'이면 외감법상 과징금 대상이 아닙니다(경고·주의·증권발행제한 등 조치)." };
  const total = fineItems.reduce((x, r) => x + r.amountWon, 0);
  const groups = ["INTENT", "GROSS_NEGLIGENCE"].map((m) => [m, fineItems.filter((r) => r.motive === m).reduce((x, r) => x + r.amountWon, 0)]).filter(([, v]) => v > 0);
  const sizeLevel = FineModel.sizeLevel(asm.fineMultiple);
  const kindLevel = FineModel.kindLevel(s.kind);
  const upIds = fineUp(a.reasons, up, auto64);
  const downIds = fineDown(a.reasons, down);
  const compMotive = groups.some(([m]) => m === "INTENT") ? "INTENT" : "GROSS_NEGLIGENCE";
  const contentHigh = a.content === "HIGH" && compMotive !== "GROSS_NEGLIGENCE";
  const common = { motive: compMotive, upIds, upFreePct: a.upFreePct, years: s.years, contentHigh, downs: downIds, downFreePct: a.downFreePct };
  const title = actorTitle(a) + " 과징금";
  let fine;
  if (a.kind === "COMPANY" || a.kind === "OFFICER") {
    let basic = 0, weighted = 0;
    const scoreLines = [];
    for (const [m, amt] of groups) {
      const sc = FineModel.score(a.content, sizeLevel, kindLevel, s.marketImpact, m);
      const [cr] = FineModel.rate(sc.score);
      basic += (amt * cr) / 100;
      weighted += sc.score * amt;
      scoreLines.push(`[${Motive[m].label}] 중요도 점수 ${sc.score} → 회사 부과기준율 ${cr}% (기준금액 ${Format.won(amt)})`, ...sc.lines.map((x) => "   " + x));
    }
    const sumBase = groups.reduce((x, [, v]) => x + v, 0);
    const cap = Math.trunc((total * 20) / 100);
    if (a.kind === "COMPANY") {
      fine = { title, scoreLines, result: FineModel.compute({ ...common, actorLabel: "회사", baseWon: sumBase, basicWon: Math.trunc(basic), basicNote: "Σ(동기별 기준금액 × 부과기준율)", isCompanyRate: true, statutoryCapWon: cap, capmFineWon: capmWon }), note: `법정 상한(위반금액의 20%) ${Format.won(cap)}` };
    } else {
      const avgScore = weighted / sumBase;
      const bw = Format.eokToWon(a.benefitEok);
      const officerBase = Math.max(bw > 0 ? bw : 0, EOK);
      const oRate = FineModel.rate(avgScore)[1];
      const officerCap = Math.trunc(cap / 10);
      fine = { title, scoreLines: [], result: FineModel.compute({ ...common, actorLabel: "회사 관계자", baseWon: officerBase, basicWon: Math.trunc((officerBase * oRate) / 100), basicNote: `받은 경제적 이익 ${Format.won(officerBase)} × ${oRate}% (위반별 점수의 가중평균 ${f2(avgScore)})`, isCompanyRate: false, statutoryCapWon: officerCap, capmFineWon: null }),
        note: `기준금액: 보수·배당 등 일체의 경제적 이익(산출 곤란하거나 1억원 이하이면 1억원). 법정 상한(위반금액 20%의 10%) ${Format.won(officerCap)}` };
    }
  } else {
    const fw = Format.eokToWon(a.feeEok);
    if (!(fw > 0)) fine = { title, scoreLines: [], result: null, note: "감사보수(억원)를 입력하면 계산합니다." };
    else {
      const sc = FineModel.score(a.content, sizeLevel, kindLevel, s.marketImpact, compMotive);
      const rate = FineModel.rate(sc.score)[1];
      fine = { title, scoreLines: [`중요도 점수 ${sc.score}`, ...sc.lines.map((x) => "   " + x)], result: FineModel.compute({ ...common, actorLabel: "감사인", baseWon: fw, basicWon: Math.trunc((fw * rate) / 100), basicNote: `감사보수 ${Format.won(fw)} × 부과기준율 ${rate}% (점수 ${sc.score})`, isCompanyRate: false, statutoryCapWon: fw * 5, capmFineWon: capmWon }), note: `법정 상한(감사보수의 5배) ${Format.won(fw * 5)}` };
    }
  }
  return { actor: a, rowCount: items.length, assessment: asm, actions, fine, note: "" };
}

// ---------------------------------------------------------------- 주가(네이버 증권 응답 해석)

const ROW = /\[\s*"(\d{8})"\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/g;
export const Stock = {
  candles: (text) => [...String(text).matchAll(ROW)].map((m) => ({ date: m[1], close: +m[5], volume: +m[6] })),
  tradingDays: (c) => c.filter((x) => x.volume > 0),
  avgTradingWon(c) {
    const d = Stock.tradingDays(c);
    return d.length ? Math.trunc(d.reduce((a, x) => a + x.close * x.volume, 0) / d.length) : null;
  },
  /** "2025-01-01"/"20250101" → "20250101", 잘못되면 null */
  ymd(text) {
    const d = String(text || "").trim().replace(/[-./]/g, "");
    if (!/^\d{8}$/.test(d)) return null;
    const dt = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6)));
    return dt.getUTCFullYear() === +d.slice(0, 4) && dt.getUTCMonth() === +d.slice(4, 6) - 1 && dt.getUTCDate() === +d.slice(6) ? d : null;
  },
  dash: (d) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d || ""),
  market: (t) => (/코스닥|KOSDAQ/i.test(t) ? "코스닥" : /코넥스|KONEX/i.test(t) ? "코넥스" : /코스피|KOSPI/i.test(t) ? "유가증권" : t),
  kindFor: (m) => ({ 코스닥: "KOSDAQ", 코넥스: "KONEX", 유가증권: "KOSPI" })[m] || null,
};

// ---------------------------------------------------------------- 저장 형식(앱 SimCodec과 같은 JSON)

export const FORMAT = "fss-accounting-simulation";
export function encodeSims(list) {
  return JSON.stringify({ format: FORMAT, version: 1, items: list }, null, 1);
}
export function decodeSims(text) {
  const root = JSON.parse(text);
  const arr = Array.isArray(root?.items) ? root.items : root && typeof root === "object" && root.settings ? [root] : [];
  return arr.filter((o) => o && typeof o === "object").map((o) => ({
    id: String(o.id || Date.now() + Math.random().toString(36).slice(2, 6)),
    name: String(o.name || "이름 없음"),
    savedAt: String(o.savedAt || ""),
    company: String(o.company || ""),
    settings: normalizeSettings(o.settings || {}),
    stock: o.stock && typeof o.stock === "object" ? o.stock : null,
  }));
}
