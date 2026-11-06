// 주요사이트: 사이트마다 짧은 설명, 추가·수정·삭제·기본값 복원(이 브라우저에 저장).
import { setHeader } from "../app.js";
import { dialog, h, icon, iconButton, message, store } from "../core.js";

const DESCRIPTIONS = [
  ["fss.or.kr", "금융감독·검사 업무, 보도자료와 제재·공시 정보를 제공합니다."],
  ["fsc.go.kr", "금융정책·규제, 보도자료와 법령해석 정보를 제공합니다."],
  ["dart.fss.or.kr", "상장·등록법인의 사업보고서 등 기업 공시를 조회합니다."],
  ["sec.gov", "미국 SEC에 제출된 상장기업 공시(10-K·10-Q 등)를 조회합니다."],
  ["fine.fss.or.kr", "금융소비자를 위한 금융상품 비교와 금융회사 정보를 제공합니다."],
  ["kind.krx.co.kr", "한국거래소 상장법인의 공시(KIND)와 시장조치·기업 정보를 조회합니다."],
  ["kasb.or.kr", "한국회계기준원의 회계기준(K-IFRS) 제·개정과 해석, 질의회신을 제공합니다."],
  ["accountingwiki.co.kr", "회계기준·실무 이슈를 정리한 회계 지식 위키입니다."],
  ["krx.co.kr", "주식·파생상품 시장 정보와 상장·시장감시 안내를 제공합니다."],
  ["law.go.kr", "법령·행정규칙·판례 등 법령정보를 검색합니다."],
  ["freesis.kofia.or.kr", "금융투자업권 통계와 시장 현황 자료를 제공합니다."],
  ["kofiabond.or.kr", "채권 시가평가·민평 금리 등 채권시장 정보를 제공합니다."],
  ["dis.kofia.or.kr", "금융투자회사 공시와 협회 규정·통계를 조회합니다."],
  ["seibro.or.kr", "증권 예탁·결제, 주식·채권 발행과 권리행사 정보를 제공합니다."],
  ["kcmi.re.kr", "자본시장 정책·제도 연구보고서와 이슈 분석을 제공합니다."],
  ["kif.re.kr", "금융·거시경제 연구보고서와 금융 전망을 제공합니다."],
  ["iosco.org", "국제증권관리위원회기구(IOSCO)의 보고서와 규제 기준을 제공합니다."],
  ["bis.org", "국제결제은행(BIS)과 바젤위원회의 간행물·보고서를 제공합니다."],
  ["fca.org.uk", "영국 금융행위감독청(FCA)의 연구·정책 자료를 제공합니다."],
  ["mas.gov.sg", "싱가포르 통화청(MAS)의 간행물과 감독 자료를 제공합니다."],
].sort((a, b) => b[0].length - a[0].length);

export function defaultDescription(url) {
  return DESCRIPTIONS.find(([k]) => url.toLowerCase().includes(k))?.[1] || "";
}
const site = (name, url) => ({ name, url, description: defaultDescription(url) });
export const DEFAULT_SITES = [
  site("금융감독원", "https://www.fss.or.kr"),
  site("금융위원회", "https://www.fsc.go.kr"),
  site("전자공시시스템 DART", "https://dart.fss.or.kr"),
  site("한국거래소 전자공시 KIND", "https://kind.krx.co.kr"),
  site("미국 공시시스템 EDGAR", "https://www.sec.gov/edgar/search/"),
  site("한국회계기준원", "https://www.kasb.or.kr"),
  site("회계위키", "https://accountingwiki.co.kr"),
  site("금융소비자 정보포털 파인", "https://fine.fss.or.kr"),
  site("한국거래소", "https://www.krx.co.kr"),
  site("국가법령정보센터(법령정보시스템)", "https://www.law.go.kr"),
  site("금융투자협회 FreeSIS", "https://freesis.kofia.or.kr"),
  site("금융투자협회 채권정보센터", "https://www.kofiabond.or.kr"),
  site("금융투자협회 전자공시서비스", "https://dis.kofia.or.kr"),
  site("예탁결제원 SEIBro", "https://www.seibro.or.kr"),
  site("자본시장연구원", "https://www.kcmi.re.kr"),
  site("한국금융연구원", "https://www.kif.re.kr"),
  site("IOSCO", "https://www.iosco.org"),
];

const load = () => store.get("sites", DEFAULT_SITES);
const save = (list) => store.set("sites", list);

async function edit(initial) {
  const v = await dialog({
    title: initial ? "사이트 수정" : "사이트 추가",
    fields: [
      { name: "name", label: "이름", value: initial?.name },
      { name: "url", label: "주소 (예: www.fss.or.kr)", value: initial?.url },
      { name: "description", label: "간략한 설명 (선택)", value: initial?.description, multiline: true },
    ],
    ok: "저장",
  });
  if (!v || !v.name || !v.url) return null;
  const url = /^https?:\/\//i.test(v.url) ? v.url : "https://" + v.url;
  return { name: v.name, url, description: v.description || defaultDescription(url) };
}

export async function render(root, params, ctx) {
  const editing = params.edit === "1";
  setHeader("주요사이트", "자주 쓰는 금융·법령 사이트 모음", [
    h("button", { class: "pill", type: "button", onclick: async () => {
      const s = await edit(null);
      if (s) (save([...load(), s]), ctx.go({ edit: params.edit }, { replace: true }));
    } }, icon("plus"), h("span", { class: "lbl" }, "추가")),
    h("button", { class: "pill" + (editing ? " on" : ""), type: "button", onclick: () => ctx.go({ edit: editing ? null : "1" }, { replace: true }) }, icon("pencil"), h("span", { class: "lbl" }, editing ? "편집 끝" : "편집")),
  ]);
  const list = load();
  if (!list.length) root.append(message("사이트가 없습니다. ‘추가’를 눌러 넣어 주세요."));
  root.append(
    h("div", { class: "grid3" },
      list.map((s, i) => h("div", { class: "card site" },
        h("a", { href: s.url, target: "_blank", rel: "noopener", class: "site-a" },
          h("img", { class: "fav", src: `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(new URL(s.url).hostname)}`, alt: "", loading: "lazy" }),
          h("div", null, h("b", null, s.name), h("div", { class: "note" }, s.description || new URL(s.url).hostname))),
        editing ? h("div", { class: "row-gap", style: { marginTop: "8px" } },
          iconButton("pencil", "수정", async () => {
            const n = await edit(s);
            if (n) (list.splice(i, 1, n), save(list), ctx.go({ edit: "1" }, { replace: true }));
          }),
          iconButton("trash-2", "삭제", async () => {
            if (await dialog({ title: "사이트 삭제", text: `‘${s.name}’을(를) 목록에서 삭제할까요?`, ok: "삭제", danger: true })) (list.splice(i, 1), save(list), ctx.go({ edit: "1" }, { replace: true }));
          }),
          i > 0 ? iconButton("arrow-up", "위로", () => (list.splice(i - 1, 0, list.splice(i, 1)[0]), save(list), ctx.go({ edit: "1" }, { replace: true }))) : null) : null)))
  );
  if (editing) {
    root.append(h("div", { style: { marginTop: "16px" } }, h("button", { class: "btn ghost", type: "button", onclick: async () => {
      if (await dialog({ title: "기본값 복원", text: "지금까지 추가·수정·삭제한 내용이 사라지고 기본 사이트로 돌아갑니다.", ok: "복원", danger: true })) (store.remove("sites"), ctx.go({}, { replace: true }));
    } }, icon("rotate-ccw"), "기본 사이트로 복원")));
  }
}
