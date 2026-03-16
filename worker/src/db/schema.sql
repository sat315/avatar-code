-- AvatarCode D1スキーマ
-- ペルソナ（AIキャラクター）テーブル

CREATE TABLE IF NOT EXISTS personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- ペルソナの名前
  system_prompt TEXT NOT NULL,           -- 性格を定義するシステムプロンプト
  avatar_url TEXT,                       -- アバター画像のURL
  appearance TEXT,                       -- キャラの外見テキスト定義（Gemini生成用）
  active_costume_id INTEGER,            -- アクティブな衣装ID
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- メッセージ（会話履歴）テーブル

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL,           -- 所属するペルソナのID
  session_id TEXT,                       -- 所属するセッションのID
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),  -- 発言者ロール
  content TEXT NOT NULL,                 -- メッセージ本文
  image_url TEXT,                        -- 添付画像のURL（R2経由）
  usage_json TEXT,                       -- トークン使用量（JSON文字列）
  generated_images_json TEXT,            -- AI生成画像URL配列（JSON文字列）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- インデックス: ペルソナごとのメッセージ検索を高速化
CREATE INDEX IF NOT EXISTS idx_messages_persona_id ON messages(persona_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(persona_id, created_at);

-- フォルダ（プロジェクト）テーブル
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,                    -- UUID
  name TEXT NOT NULL,                     -- フォルダ名
  path TEXT NOT NULL,                     -- プロジェクトパス
  sort_order INTEGER NOT NULL DEFAULT 0,  -- 並び順
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- セッション（会話セッション）テーブル
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                    -- UUID
  folder_id TEXT NOT NULL,                -- 所属フォルダ
  title TEXT,                             -- セッションタイトル
  is_active INTEGER NOT NULL DEFAULT 1,   -- アクティブフラグ
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- インデックス: セッション検索を高速化
CREATE INDEX IF NOT EXISTS idx_sessions_folder_id ON sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

-- 衣装（アバター画像バリエーション）テーブル
CREATE TABLE IF NOT EXISTS costumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL,           -- 所属ペルソナ
  label TEXT NOT NULL,                   -- 衣装の名前
  image_url TEXT NOT NULL,               -- R2画像URL
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_costumes_persona ON costumes(persona_id);
