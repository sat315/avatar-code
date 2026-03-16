-- AvatarCode v2 マイグレーション
-- フォルダ（プロジェクト）とセッション管理の追加

-- フォルダ（プロジェクト）テーブル
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,                    -- UUID
  name TEXT NOT NULL,                     -- フォルダ名
  path TEXT NOT NULL,                     -- フォルダパス
  sort_order INTEGER DEFAULT 0,           -- 並び順
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- セッション（フォルダに紐づく会話）テーブル
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                    -- UUID
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,  -- 所属フォルダ
  title TEXT,                             -- セッションタイトル
  is_active INTEGER DEFAULT 1,           -- アクティブフラグ（Phase 1: 1フォルダ1アクティブセッション）
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- インデックス: フォルダごとのセッション検索を高速化
CREATE INDEX IF NOT EXISTS idx_sessions_folder_id ON sessions(folder_id);

-- messagesテーブルにsession_idカラムを追加（既存データはnull許容）
ALTER TABLE messages ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE;

-- セッションごとのメッセージ検索用インデックス
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
