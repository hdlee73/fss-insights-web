# FSS Insights 웹

FSS Insights(안드로이드 앱)의 웹 버전(PWA)입니다.

## 금융소비자 메뉴 (v2.6.0)

[금융소비자 지킴이](https://github.com/hdlee73/consumer) 웹의 기능을 왼쪽 메뉴 ‘스마트 법령검색’ 바로 아래 두 메뉴로 합쳤습니다. 입력한 내용은 서버로 보내지 않고 브라우저 안에서만 계산합니다.

- **보이스피싱 긴급대응** (`#/emergency`, `js/screens/emergency.js`): 상황을 고르면 지금 할 일을 시간 순서로 보여 주고, 완료 표시는 이 브라우저에만 저장합니다.
- **금융소비자 보호 지킴이** (`#/guard`, `js/screens/guard.js`): 하위 기능은 왼쪽 메뉴에 두지 않고 화면 위쪽 탭으로 고릅니다(`#/guard?p=diagnose` 등).
  상황별 시작 · 권리구제 진단기 · 분쟁조정 사례 · 제도권 금융회사 조회 · 소비자보호 성적표 · 금융꿀팁·소비자경보
- 코드: `js/consumer/`(화면·계산), 자료: `data/consumer/`, 연결부: `js/consumer/nav.js`(하위 화면 이동·제목줄을 FSS Insights 뼈대에 맞춤).
- 검사: `node tests/consumer/rights.test.mjs && node tests/consumer/search.test.mjs && node tests/consumer/validate-data.mjs`
