import { Hono } from "hono";
import type { Bindings } from "../index";

// 画像アップロードルート
export const uploadRoute = new Hono<{ Bindings: Bindings }>();

// 許可するContent-Type
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

// 最大ファイルサイズ: 20MB
const MAX_SIZE = 20 * 1024 * 1024;

/**
 * POST /api/upload
 * 画像をR2にアップロードし、公開URLを返す
 *
 * リクエスト: multipart/form-data
 * - file: 画像ファイル（JPEG, PNG, GIF, WebP, HEIC, HEIF / 20MBまで）
 *
 * レスポンス: { url: string }
 */
uploadRoute.post("/", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return c.json({ error: "ファイルが見つかりません" }, 400);
    }

    // FormDataEntryValueからFile型として扱う
    const f = file as unknown as { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

    // Content-Typeチェック
    if (!ALLOWED_TYPES.includes(f.type)) {
      return c.json(
        { error: `対応していない画像形式です。対応形式: ${ALLOWED_TYPES.join(", ")}` },
        400
      );
    }

    // サイズチェック
    if (f.size > MAX_SIZE) {
      return c.json(
        { error: "ファイルサイズが大きすぎます（上限: 20MB）" },
        400
      );
    }

    // ユニークなキーを生成
    const ext = f.type.split("/")[1] === "jpeg" ? "jpg" : f.type.split("/")[1];
    const key = `chat/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    // R2にアップロード
    await c.env.UPLOADS.put(key, await f.arrayBuffer(), {
      httpMetadata: {
        contentType: f.type,
      },
    });

    // 公開URLを返す（R2カスタムドメインまたはWorker経由で配信）
    return c.json({ url: `/upload/${key}` }, 201);
  } catch (error) {
    console.error("アップロードエラー:", error);
    return c.json({ error: "画像のアップロードに失敗しました" }, 500);
  }
});

/**
 * GET /api/upload/avatar/:filename
 * R2からアバター画像を取得して返す
 */
uploadRoute.get("/avatar/:filename", async (c) => {
  const filename = c.req.param("filename");
  const key = `avatar/${filename}`;

  try {
    const object = await c.env.UPLOADS.get(key);
    if (!object) {
      return c.json({ error: "画像が見つかりません" }, 404);
    }

    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType || "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
  } catch (error) {
    console.error("アバター画像取得エラー:", error);
    return c.json({ error: "画像の取得に失敗しました" }, 500);
  }
});

/**
 * GET /api/upload/selfie/:filename
 * R2から自撮り画像を取得して返す
 */
uploadRoute.get("/selfie/:filename", async (c) => {
  const filename = c.req.param("filename");
  const key = `selfie/${filename}`;

  try {
    const object = await c.env.UPLOADS.get(key);
    if (!object) {
      return c.json({ error: "画像が見つかりません" }, 404);
    }

    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType || "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
  } catch (error) {
    console.error("自撮り画像取得エラー:", error);
    return c.json({ error: "画像の取得に失敗しました" }, 500);
  }
});

/**
 * GET /api/upload/chat/:filename
 * R2から画像を取得して返す
 */
uploadRoute.get("/chat/:filename", async (c) => {
  const filename = c.req.param("filename");
  const key = `chat/${filename}`;

  try {
    const object = await c.env.UPLOADS.get(key);
    if (!object) {
      return c.json({ error: "画像が見つかりません" }, 404);
    }

    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType || "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
  } catch (error) {
    console.error("画像取得エラー:", error);
    return c.json({ error: "画像の取得に失敗しました" }, 500);
  }
});
