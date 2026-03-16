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
};

const app = new Hono<{ Bindings: Bindings }>();

// ミドルウェア
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      const allowed = [
        process.env.FRONTEND_URL,      // 本番フロントエンドURL（環境変数で設定）
        "http://localhost:5173",
      ].filter(Boolean) as string[];
      if (allowed.includes(origin)) return origin;
      if (/\.pages\.dev$/.test(origin)) return origin;  // Cloudflare Pages preview URLs
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    maxAge: 86400,
  })
);

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
