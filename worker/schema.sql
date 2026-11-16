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
