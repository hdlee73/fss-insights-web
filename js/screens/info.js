// 앱 정보: 이름·버전, 만든이, 업데이트(자동), 설치 방법, 기본 사용법, 자료 출처.
import { applyUpdate, checkForUpdate, setHeader, updateReady } from "../app.js";
import { APP_NAME, APP_VERSION, card, h, icon, store, toast } from "../core.js";

let installEvent = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
});

const GUIDE = [
  ["화면 이동", "왼쪽 메뉴에서 화면을 고릅니다. PC에서는 메뉴 위의 접기 단추로 아이콘만 남길 수 있고, 휴대폰에서는 ☰ 단추나 화면 왼쪽 가장자리를 오른쪽으로 밀어 메뉴를 엽니다. 뒤로가기(단추·제스처)는 직전 화면으로 돌아갑니다."],
  ["오늘의 브리핑", "서울 날씨와 함께 시장 지표·주요 금융 통계·최근 금융당국 보도자료·이번 주 금융리포트를 한 화면에 모았습니다. 각 묶음의 ‘더 보기’를 누르면 해당 메뉴로 갑니다. 브리핑에 띄울 지표·통계는 금융시장 동향의 ‘지표 선택’·‘통계 선택’에서 고릅니다."],
  ["보도자료 · 금융관련 리포트", "기관 탭을 고르면 최근 20건이 나옵니다. 보도자료는 검색창에서 최근 10년의 제목을 찾을 수 있고, 북마크 단추로 저장함에 담아 둡니다. ‘기관 추가’로 목록 주소를 넣어 기관을 늘릴 수 있습니다."],
  ["유권해석·비조치의견서·행정지도", "금융위 법령해석·비조치의견서와 금감원·금융위 행정지도를 최근 20건씩 보고, 항목을 누르면 원문 게시글이 열립니다."],
  ["금융시장 동향", "주가지수·환율·금리와 한국은행 통계를 봅니다. 관심종목을 추가할 수 있습니다."],
  ["금융회사 주요 현황", "권역(은행·보험·증권 등)을 고르면 총자산 순위가 나오고, 회사를 누르면 재무현황·주요 경영지표·최근 제재내역을 봅니다. 위쪽 ‘저장’으로 세 가지를 PDF·한글(HWPX) 문서로 저장합니다."],
  ["금융회사 제재현황", "2011년 이후 금감원 제재공시를 회사명·지적제목·법조문으로 찾고, 기간·권역으로 거릅니다. ‘통계’ 탭과 엑셀(.xlsx) 저장을 지원합니다. 위반 조항을 누르면 스마트 법령검색이 그 조문으로 열립니다."],
  ["기업 개황 및 공시(DART)", "회사명을 검색해 개황·최대주주·재무손익·정기/주요사항/기타 공시와 주가를 봅니다. 위쪽 ‘저장’으로 개황·최대주주·재무손익을 PDF·한글(HWPX) 문서로 저장하고, 자주 보는 회사는 관심기업에 담습니다."],
  ["스마트 법령검색", "‘자본시장법 제85조 제2호’처럼 법령명과 조문(항·호·목까지)을 넣으면 그 조문이 위임한 시행령·시행규칙·감독규정·시행세칙을 위임한 줄 바로 아래에 이어 보여 주고, 그 조문을 인용한 판례만 골라 줍니다. 낱말만 넣으면 법령·행정규칙·판례와 조문 제목·내용을 함께 찾습니다. ‘현행 기준’ 단추로 과거 시점 조문을, ‘시행 연혁’으로 버전을 고르고, 비교표·결과 안에서 찾기·항목 숨기기·PDF/한글(HWPX) 저장·보관함을 지원합니다. 본문의 ‘법 제12조’ 같은 인용을 누르면 그 조문으로 이동합니다."],
  ["참고 자료실", "공유 드라이브에 올린 참고자료를 폴더·태그·본문 검색으로 찾고 내려받습니다."],
  ["주요사이트 · 알림", "주요사이트는 편집 단추로 추가·수정·삭제합니다. 알림 설정에서 키워드(금감원·금융위 보도자료 제목), 새 자료를 볼 기관, 참고 자료실, 오늘의 브리핑 시각을 정해 두면 새 글을 ‘새 소식’에 모으고 메뉴에 숫자로 표시합니다. 브라우저 알림을 허용하면 화면 알림도 띄웁니다. 웹은 열려 있는 동안(설치한 웹 앱 포함) 30분마다 확인합니다."],
  ["설치해서 쓰기", "Chrome·Edge 주소창의 설치 단추나 아래 ‘앱으로 설치’를 누르면 바탕화면·홈 화면에 아이콘이 생기고 앱처럼 열립니다. 갤럭시 휴대폰은 Chrome 메뉴(⋮) → ‘홈 화면에 추가’를 누릅니다."],
];

export async function render(root) {
  setHeader("앱 정보", `${APP_NAME} v${APP_VERSION}`);
  const updateLine = h("span", null, updateReady() ? "새 버전이 준비되었습니다." : "자동 업데이트 사용 중");
  const updateBtn = h("button", { class: "btn ghost sm", type: "button", onclick: async () => {
    if (updateReady()) return applyUpdate();
    updateBtn.disabled = true;
    updateLine.textContent = "확인 중…";
    const found = await checkForUpdate().catch(() => false);
    updateBtn.disabled = false;
    updateLine.textContent = found ? "새 버전을 받는 중입니다. 잠시 뒤 화면 아래 ‘지금 적용’을 누르세요." : "최신 버전입니다.";
  } }, icon("refresh-cw"), updateReady() ? "지금 적용" : "업데이트 확인");

  const installBtn = h("button", { class: "btn", type: "button", onclick: async () => {
    if (!installEvent) return toast("브라우저 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 이용해 주세요.");
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
  } }, icon("download"), "앱으로 설치");
  const installed = matchMedia("(display-mode: standalone)").matches;

  root.append(
    h("div", { class: "grid2" },
      h("div", { class: "col" },
        h("section", { class: "card" },
          h("div", { class: "info-head" },
            h("img", { src: "icons/icon-192.png", alt: "" }),
            h("div", null, h("h2", null, "FSS Insights 웹"), h("div", { class: "note" }, `버전 ${APP_VERSION} · 금융감독 업무 자료 모음`))),
          h("dl", { class: "kv", style: { marginTop: "14px" } },
            h("dt", null, "앱 이름"), h("dd", null, "FSS Insights (웹 버전)"),
            h("dt", null, "버전"), h("dd", null, APP_VERSION),
            h("dt", null, "만든이"), h("dd", null, "이현덕 with Claude"),
            h("dt", null, "이메일"), h("dd", null, h("a", { href: "mailto:hdlee73@gmail.com" }, "hdlee73@gmail.com")),
            h("dt", null, "홈페이지"), h("dd", null, h("a", { href: "https://hdlee73.github.io/Home/", target: "_blank", rel: "noopener" }, "https://hdlee73.github.io/Home/")),
            h("dt", null, "안드로이드 앱"), h("dd", null, h("a", { href: "https://github.com/hdlee73/FSS_insights/releases/latest", target: "_blank", rel: "noopener" }, "최신 APK 받기")))),
        card("업데이트 정보", "refresh-cw", h("div", { class: "stack" },
          h("p", null, "새 버전이 배포되면 웹 앱이 자동으로 받아 두고 화면 아래에 ‘새 버전이 준비되었습니다’를 띄웁니다. ‘지금 적용’을 누르거나, 다음에 열 때 자동으로 바뀝니다."),
          h("div", { class: "row-gap" }, updateBtn, updateLine))),
        card("설치", "download", h("div", { class: "stack" },
          h("p", null, installed ? "앱으로 설치되어 실행 중입니다." : "설치하면 바탕화면·홈 화면 아이콘으로 바로 열 수 있습니다."),
          installed ? null : h("div", null, installBtn))),
        card("개인정보와 저장", "info", h("div", { class: "stack note" },
          h("p", null, "키워드·저장함·관심종목·주요사이트 같은 설정은 이 브라우저에만 저장되고 서버로 보내지 않습니다. 브라우저의 사이트 데이터를 지우면 함께 지워집니다."),
          h("label", { class: "row-gap" },
            (() => {
              const cb = h("input", { type: "checkbox" });
              cb.checked = store.get("usageStats", true);
              cb.addEventListener("change", () => import("../usage.js").then((u) => u.setEnabled(cb.checked)));
              return cb;
            })(),
            "익명 사용 통계 보내기(하루 한 번 무작위 번호·버전·메뉴별 이용 횟수만)")))),
      h("div", { class: "col" },
        card("기본 사용법", "book-open", h("div", { class: "prose" }, GUIDE.map(([t, d]) => [h("h4", null, t), h("p", null, d)]))),
        card("자료 출처", "globe", h("p", { class: "prose note" }, "금융감독원·금융위원회·한국은행 등 각 기관 웹사이트, 국가법령정보 공동활용 Open API, DART Open API, 금융통계정보시스템(FISIS), 한국은행 ECOS, 네이버 증권 시세를 읽어 제목·요약·링크만 보여 줍니다. 원문 저작권은 각 기관에 있습니다."))))
  );
}
