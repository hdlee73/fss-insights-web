CREATE TABLE IF NOT EXISTS board_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_notice INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '익명',
  pw_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_posts_notice ON board_posts (is_notice DESC, id DESC);

CREATE TABLE IF NOT EXISTS board_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author TEXT NOT NULL DEFAULT '익명',
  body TEXT NOT NULL,
  pw_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_comments_post ON board_comments (post_id, id ASC);

-- 좋아요·싫어요 (글마다 익명 ID 1표)
CREATE TABLE IF NOT EXISTS board_votes (
  post_id INTEGER NOT NULL,
  voter TEXT NOT NULL,
  vote INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, voter)
);

-- 수정 시각 (Worker가 첫 요청 때 자동으로 추가한다. 수동으로 하려면 아래 실행)
-- ALTER TABLE board_posts ADD COLUMN edited_at TEXT;
-- ALTER TABLE board_comments ADD COLUMN edited_at TEXT;
