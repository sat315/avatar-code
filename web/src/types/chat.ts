import type { ToolActivity } from "../components/ToolActivityCard";
import type { Folder } from "../components/Sidebar";

/** トークン使用量・コスト情報 */
export interface MessageUsage {
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  numTurns: number;
}

/** メッセージの型定義 */
export interface Message {
  id?: number;
  role: "user" | "ai";
  content: string;
  thinking?: string;
  image?: string;
  generatedImages?: string[];
  /** 画像生成中フラグ（DBからロードした履歴には付かない、現セッション生成中のみ true） */
  pendingImages?: boolean;
  imageUrl?: string | null;
  toolActivities?: ToolActivity[];
  usage?: MessageUsage;
  /** セッション終了の区切り線 */
  isSeparator?: boolean;
}

/** APIから取得するペルソナの型 */
export interface PersonaData {
  id: number;
  name: string;
  system_prompt: string;
  avatar_url: string | null;
}

/** ブリッジ接続ステータス */
export type BridgeStatus = "online" | "offline" | "checking";

/** ツール承認リクエスト */
export interface PermissionRequest {
  toolUseId: string;
  toolName: string;
  input: unknown;
}

/** セッション情報 */
export interface Session {
  id: string;
  folder_id: string;
  title: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// 既存コンポーネントの型を再エクスポート
export type { ToolActivity, Folder };
