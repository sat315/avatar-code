/**
 * Gemini API 共通ユーティリティ
 * avatar.ts / selfie.ts から共有して使用する
 */

export const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

/** generateContent レスポンスの型 */
export interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      >;
    };
  }>;
}

/** ListModels レスポンスの型 */
interface ModelsResponse {
  models?: Array<{
    name: string;
    supportedGenerationMethods?: string[];
  }>;
}

/**
 * APIキーで利用可能な画像生成対応モデルを探す
 * 名前に "image" を含む generateContent 対応モデルを優先
 */
export async function findImageModel(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`);
    if (!res.ok) return null;

    const data = (await res.json()) as ModelsResponse;
    if (!data.models) return null;

    console.log(
      "利用可能モデル一覧:",
      data.models.map((m) => m.name).join(", ")
    );

    // 1. 名前に "image" を含む generateContent 対応モデルを優先
    const imageModel = data.models.find(
      (m) =>
        m.name?.includes("image") &&
        m.supportedGenerationMethods?.includes("generateContent")
    );
    if (imageModel) {
      return imageModel.name.replace("models/", "");
    }

    // 2. 見つからなければ generateContent 対応モデルをログ出力
    const gcModels = data.models.filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    );
    console.log(
      "generateContent対応モデル:",
      gcModels.map((m) => m.name).join(", ")
    );

    return null;
  } catch {
    return null;
  }
}

/**
 * 画像URLからbase64を取得する
 * - "/upload/" パスなら R2 から直接取得
 * - それ以外なら FRONTEND_URL 環境変数のドメインから HTTP フェッチ
 */
export async function fetchImageAsBase64(
  imageUrl: string,
  r2Bucket: R2Bucket
): Promise<{ base64: string; mimeType: string } | null> {
  let imageBuffer: ArrayBuffer | null = null;
  let mimeType = "image/png";

  if (imageUrl.startsWith("/upload/")) {
    const r2Key = imageUrl.replace(/^\/upload\//, "");
    console.log("参照画像R2キー:", r2Key);
    const r2Object = await r2Bucket.get(r2Key);
    if (r2Object) {
      imageBuffer = await r2Object.arrayBuffer();
      mimeType = r2Object.httpMetadata?.contentType || "image/png";
    }
  } else {
    const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
    const pagesUrl = `${frontendUrl}${imageUrl}`;
    console.log("参照画像を外部URLから取得:", pagesUrl);
    try {
      const res = await fetch(pagesUrl);
      if (res.ok) {
        imageBuffer = await res.arrayBuffer();
        mimeType = res.headers.get("content-type") || "image/png";
      }
    } catch (e) {
      console.error("外部URL取得エラー:", e);
    }
  }

  if (!imageBuffer) return null;

  const bytes = new Uint8Array(imageBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return { base64: btoa(binary), mimeType };
}

/** Gemini API parts の型 */
export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Gemini generateContent API を呼び出す
 */
export async function callGemini(
  apiKey: string,
  model: string,
  parts: GeminiPart[]
): Promise<Response> {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });
}

/**
 * base64 画像を R2 に保存して "/upload/{key}" パスを返す
 * @param prefix - R2 キーのプレフィックス（例: "avatar", "selfie"）
 */
export async function saveImageToR2(
  r2Bucket: R2Bucket,
  base64: string,
  mimeType: string,
  prefix: string
): Promise<string> {
  const ext = mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1];
  const key = `${prefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const binaryString = atob(base64);
  const imgBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    imgBytes[i] = binaryString.charCodeAt(i);
  }

  await r2Bucket.put(key, imgBytes.buffer, {
    httpMetadata: { contentType: mimeType },
  });

  return `/upload/${key}`;
}
