/**
 * Gemini API 共通ユーティリティ
 * avatar.ts / selfie.ts から共有して使用する
 */

export const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

/** モジュールレベルキャッシュ（Workerウォーム中は再利用される） */
let cachedImageModel: string | null = null;

/** キャッシュをリセットする（モデル優先度変更後に呼び出す） */
export function resetImageModelCache(): void {
  cachedImageModel = null;
}

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
 * モジュールレベルでキャッシュし、Workerがウォームな間は再検索しない
 */
export async function findImageModel(apiKey: string): Promise<string | null> {
  if (cachedImageModel) {
    console.log("モデルキャッシュヒット:", cachedImageModel);
    return cachedImageModel;
  }

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`);
    if (!res.ok) return null;

    const data = (await res.json()) as ModelsResponse;
    if (!data.models) return null;

    console.log(
      "利用可能モデル一覧:",
      data.models.map((m) => m.name).join(", ")
    );

    // 1. gemini-*-image-generation 系を最優先（image input 対応 = img2img 可能）
    const geminiImageModel = data.models.find(
      (m) =>
        m.name?.includes("gemini") &&
        m.name?.includes("image") &&
        m.supportedGenerationMethods?.includes("generateContent")
    );
    if (geminiImageModel) {
      cachedImageModel = geminiImageModel.name.replace("models/", "");
      console.log("Gemini image モデル選択:", cachedImageModel);
      return cachedImageModel;
    }

    // 2. imagen-* 系フォールバック（text-to-image のみ・image input 不可）
    const imageModel = data.models.find(
      (m) =>
        m.name?.includes("image") &&
        m.supportedGenerationMethods?.includes("generateContent")
    );
    if (imageModel) {
      cachedImageModel = imageModel.name.replace("models/", "");
      console.log("imagen フォールバックモデル選択（img2img 不可）:", cachedImageModel);
      return cachedImageModel;
    }

    // 3. 見つからなければ generateContent 対応モデルをログ出力
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
 * - "/upload/" パスなら R2 から直接取得（最速）
 * - "https?://" で始まるフルURLなら HTTP フェッチ
 * - それ以外は不明なパス形式としてスキップ
 */
export async function fetchImageAsBase64(
  imageUrl: string,
  r2Bucket: R2Bucket
): Promise<{ base64: string; mimeType: string } | null> {
  let imageBuffer: ArrayBuffer | null = null;
  let mimeType = "image/png";

  if (imageUrl.startsWith("/upload/")) {
    // R2 直接アクセス（最速・ゼロエグレス）
    const r2Key = imageUrl.replace(/^\/upload\//, "");
    console.log("参照画像R2キー:", r2Key);
    const r2Object = await r2Bucket.get(r2Key);
    if (r2Object) {
      imageBuffer = await r2Object.arrayBuffer();
      mimeType = r2Object.httpMetadata?.contentType || "image/png";
    }
  } else if (/^https?:\/\//.test(imageUrl)) {
    // フルURL（例: https://example.com/upload/...）はそのままフェッチ
    console.log("参照画像をフルURLから取得:", imageUrl);
    try {
      const res = await fetch(imageUrl);
      if (res.ok) {
        imageBuffer = await res.arrayBuffer();
        mimeType = res.headers.get("content-type") || "image/png";
      }
    } catch (e) {
      console.error("フルURL取得エラー:", e);
    }
  } else {
    // 相対パス（/upload/ 以外）→ 取得不可として警告
    console.warn("参照画像の取得をスキップ: 不明なパス形式:", imageUrl);
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
 * 429（レート制限）時に指数バックオフでリトライする Gemini 呼び出し
 * 最大3回試行: 即時 → 2秒後 → 5秒後
 */
export async function callGeminiWithRetry(
  apiKey: string,
  model: string,
  parts: GeminiPart[],
  maxRetries = 3
): Promise<Response> {
  const delays = [0, 2000, 5000];
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (delays[attempt] > 0) {
      console.log(`Gemini 429 リトライ待機中: ${delays[attempt]}ms (試行 ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }

    const response = await callGemini(apiKey, model, parts);
    lastResponse = response;

    if (response.status !== 429) {
      return response;
    }

    console.warn(`Gemini 429 Too Many Requests (試行 ${attempt + 1}/${maxRetries})`);
  }

  return lastResponse!;
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
