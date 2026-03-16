import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { chatRoute } from "./routes/chat";
import { avatarRoute } from "./routes/avatar";
import { personaRoute } from "./routes/persona";
import { messagesRoute } from "./routes/messages";
import { deployRoute } from "./routes/deploy";
import { uploadRoute } from "./routes/upload";
import { costumesRoute } from "./routes/costumes";
import { foldersRoute } from "./routes/folders";
import { sessionsRoute } from "./routes/sessions";
import { selfieRoute } from "./routes/selfie";
import { manifestRoute } from "./routes/manifest";
import { apiAuth } from "./middleware/auth";

// 環境変数・バインディングの型定義
export type Bindings = {
  DB: D1Database;
  UPLOADS: R2Bucket;       // R2画像ストレージ
  BRIDGE_URL: string;      // ブリッジサーバーのURL（Cloudflare Tunnel経由）
  BRIDGE_SECRET: string;   // ブリッジ認証トークン（Worker↔Bridge間）
  API_KEY: string;         // フロントエンド認証キー（BRIDGE_SECRETとは別値）
  GEMINI_API_KEY: string;  // Gemini APIキー（アバター生成用）
  FRONTEND_URL?: string;   // 本番フロントエンドURL（CORS許可用、未設定時は *.pages.dev を許可）
};

const app = new Hono<{ Bindings: Bindings }>();

// ミドルウェア
app.use("*", logger());
// CORS設定: c.envからFRONTEND_URLを参照するためミドルウェア内でcors()を呼び出す
app.use("/api/*", async (c, next) => {
  const frontendUrl = c.env.FRONTEND_URL;
  if (!frontendUrl) {
    console.warn("⚠️ FRONTEND_URL が未設定です。全ての *.pages.dev ドメインからのアクセスを許可します。セキュリティ向上のため FRONTEND_URL の設定を推奨します。");
  }
  const handler = cors({
    origin: (origin) => {
      const allowed = [
        frontendUrl,
        "http://localhost:5173",
      ].filter(Boolean) as string[];
      if (allowed.includes(origin)) return origin;
      // FRONTEND_URL 未設定時のみ *.pages.dev を許可（後方互換）
      if (!frontendUrl && /\.pages\.dev$/.test(origin)) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    maxAge: 86400,
  });
  return handler(c, next);
});

// API認証（CORS後、ルート結合前に適用）
app.use("/api/*", apiAuth);

// ヘルスチェック（認証不要）
app.get("/", (c) => c.json({ status: "ok", service: "avatar-code-api" }));

// ルート結合
app.route("/api/chat", chatRoute);
app.route("/api/avatar", avatarRoute);
app.route("/api/persona", personaRoute);
app.route("/api/messages", messagesRoute);
app.route("/api/deploy", deployRoute);
app.route("/api/upload", uploadRoute);
app.route("/api/costumes", costumesRoute);
app.route("/api/folders", foldersRoute);
app.route("/api/sessions", sessionsRoute);
app.route("/api/selfie", selfieRoute);
app.route("/api/manifest", manifestRoute);

export default app;
