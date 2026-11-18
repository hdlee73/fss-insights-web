# 금융사 리스크 대시보드 — 시뮬레이션 미리보기

배포 없이 화면을 보기 위한 폴더입니다(웹·앱·서버 어디에도 배포되지 않음).

- 실행: 저장소 루트에서 `python3 -m http.server 8765` 후 `http://localhost:8765/preview/risk/index.html`
- `snapshot.json`: `make-snapshot.mjs`가 기존 서버의 읽기 전용 경로(/fisis, /dart)와 제재공시(sanction-data)에서 받아 둔 실제 자료 스냅샷
- 실제 화면은 메뉴 "금융사 리스크 대시보드"(`#/risk`)이며 `js/screens/risk.js` → `risk-live.js`가 같은 서버 경로로 실시간 자료를 씁니다.

## 서버 변경 필요 여부
없음. 새 API 키·Worker 변경 없이 기존 `/fisis/companies|ranking|profile`, `/dart/search|company|holders`로 구성됩니다.
다만 업권 사분면은 회사마다 `/fisis/profile`을 호출(은행·증권 등 상위 30곳, 동시 6건)하므로 첫 로드가 느립니다.
느리면 업권 전체 지표를 한 번에 주는 배치 경로(`/fisis/peers?sector=`, 6시간 캐시)를 Worker에 추가하는 방안이 있으며, 이는 승인 후 24qieb 계열 브랜치에서만 진행합니다(현재 미구현).
