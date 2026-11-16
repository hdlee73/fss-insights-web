# 익명게시판 Cloudflare Worker 설정 안내 (`FSS_insights` 공용 admin)

이 게시판은 [`hdlee73/FSS_insights`](https://github.com/hdlee73/FSS_insights) 의 `server/news-proxy` 와 **동일한 D1 바인딩(`DB`) 및 관리자 토큰(`ADMIN_TOKEN`, 헤더 `X-Admin-Token`)** 을 사용합니다.

## `FSS_insights/server/news-proxy` 에 연결하기
1. `worker/board-worker.js` 파일을 `FSS_insights/server/news-proxy/board-lib.js` 로 복사합니다.
2. `FSS_insights/server/news-proxy/worker.js` 상단에 import를 추가하고, `route()` 맨 앞(또는 `fromWeb` 검사 전)에 `/board/` 라우트를 연결합니다.
   ```js
   import { handleBoard } from "./board-lib.js";
   ```
   ```js
   if (url.pathname.startsWith("/board/")) {
     return await handleBoard(request, env);
   }
   ```
3. 배포하면 기존 `/admin` · `/admin/notices` 에서 쓰시던 **`ADMIN_TOKEN`** 으로 익명게시판 공지 작성·글/댓글 삭제를 그대로 사용할 수 있으며, D1 테이블(`board_posts`, `board_comments`)도 첫 요청 시 자동 생성됩니다.
