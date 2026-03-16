import type { Context, Next } from "hono";
import type { Bindings } from "../index";

/**
 * API認証ミドルウェア
 * X-API-Key ヘッダーでAPI_KEYと照合する（BRIDGE_SECRETとは分離）
 * API_KEY未設定時はローカル開発用として認証スキップ
 */
export async function apiAuth(
  c: Context<{ Bindings: Bindings }>,
  next: Next
) {
  const path = new URL(c.req.url).pathname;

  // 画像配信エンドポイントはブラウザの<img src>から直接アクセスされるため認証スキップ
  if (c.req.method === "GET" && path.startsWith("/api/upload/")) {
    return next();
  }

  // PWAマニフェストはブラウザが直接フェッチするため認証スキップ
  if (c.req.method === "GET" && path === "/api/manifest") {
    return next();
  }

  const apiKey = c.req.header("X-API-Key");
  const secret = c.env.API_KEY;

  if (!secret) {
    // API_KEY未設定時は全リクエストを拒否（認証キーが必須）
    return c.json({ error: "API_KEY が設定されていません。サーバー管理者に連絡してください" }, 403);
  }

  if (apiKey !== secret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
}
