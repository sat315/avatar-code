/** 環境に応じたAPI接続先 */
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD
    ? ""  // 本番時は VITE_API_BASE を .env.local で設定してください
    : "http://localhost:8787/api");

/** ブリッジサーバーのHTTP URL */
export const BRIDGE_HTTP_BASE =
  import.meta.env.VITE_BRIDGE_HTTP_BASE ||
  (import.meta.env.PROD
    ? ""  // 本番時は VITE_BRIDGE_HTTP_BASE を .env.local で設定してください
    : "http://localhost:3456");

/**
 * API認証キー
 * ローカル開発時はVITE_API_KEYで設定、未設定なら空（認証スキップ）
 */
export const API_KEY = import.meta.env.VITE_API_KEY || "";

/** POST/PUT/DELETE用: Content-Type + 認証ヘッダー */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  if (extra) Object.assign(headers, extra);
  return headers;
}

/** GET/FormData用: 認証ヘッダーのみ（Content-Typeなし） */
export function authHeadersNoBody(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  return headers;
}
