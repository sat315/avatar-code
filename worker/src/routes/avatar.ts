import { Hono } from "hono";
import type { Bindings } from "../index";
import {
  GEMINI_API_BASE,
  findImageModel,
  fetchImageAsBase64,
  callGemini,
  saveImageToR2,
  type GeminiResponse,
  type GeminiPart,
} from "../utils/gemini";

// アバター生成ルート（Gemini generateContent API）
export const avatarRoute = new Hono<{ Bindings: Bindings }>();

/** ListModels レスポンスの型（モデル一覧表示用） */
interface ModelsResponse {
  models?: Array<{
    name: string;
    supportedGenerationMethods?: string[];
  }>;
}

/**
 * POST /api/avatar/generate
 * Gemini generateContent APIでアバター画像を生成する。
 * サーバー側の GEMINI_API_KEY を使用（セキュリティ向上）
 */
avatarRoute.post("/generate", async (c) => {
  const body = await c.req.json<{
    prompt: string;
    referenceImageUrl?: string;
    appearance?: string;
  }>();
  const { prompt, referenceImageUrl, appearance } = body;

  // サーバー側のAPIキーを使用
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Gemini APIキーがサーバーに設定されていません" }, 500);
  }

  if (!prompt) {
    return c.json({ error: "プロンプトが必要です" }, 400);
  }

  // 利用可能なモデルを自動検出
  const model = await findImageModel(apiKey);
  if (!model) {
    let allModels: string[] = [];
    try {
      const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`);
      if (res.ok) {
        const data = (await res.json()) as ModelsResponse;
        allModels = data.models?.map((m) => m.name ?? "") ?? [];
      }
    } catch { /* 無視 */ }
    return c.json(
      { error: "画像生成に対応したモデルが見つかりませんでした", availableModels: allModels },
      400
    );
  }

  console.log("使用モデル:", model);

  // プロンプト構築（参照画像がある場合は衣装変更指示、ない場合は新規生成）
  const enhancedPrompt = referenceImageUrl
    ? [
        "【重要】添付画像のキャラクターと完全に同一人物を描いてください。",
        "以下の特徴を絶対に変えないでください：",
        appearance ? `- キャラクターの外見: ${appearance}` : "- 顔立ち、目の色、髪の色をそのまま維持",
        "",
        `変更内容: ${prompt}`,
        "",
        "ルール:",
        "- 顔立ち、目の色、髪の色は添付画像と完全一致させること",
        "- 髪型はプロンプトの指示に従って変更してよい（指示がなければ維持）",
        "- 衣装や髪型を変更しても、キャラクターの顔・目の色・髪色は一切変えないこと",
        "- 高品質なアニメ風イラスト、バストショット、きれいな背景、テキストなし",
      ].join("\n")
    : [
        "Generate a single high quality anime-style character portrait, bust shot,",
        "clean solid color background, vibrant colors, detailed illustration.",
        "Do not include any text in the image.",
        appearance ? `Character appearance: ${appearance}.` : "",
        prompt,
      ].filter(Boolean).join(" ");

  try {
    const parts: GeminiPart[] = [];

    // 参照画像がある場合、R2から取得してマルチモーダル入力に追加
    if (referenceImageUrl) {
      const imageData = await fetchImageAsBase64(referenceImageUrl, c.env.UPLOADS);
      if (imageData) {
        parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } });
        console.log("参照画像取得成功:", imageData.mimeType, `${Math.round(imageData.base64.length / 1024)}KB`);
      } else {
        console.error("参照画像が見つかりません:", referenceImageUrl);
        return c.json(
          { error: "参照画像が見つかりませんでした。元の画像が削除された可能性があります。" },
          404
        );
      }
    }

    parts.push({ text: enhancedPrompt });

    const response = await callGemini(apiKey, model, parts);

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Gemini APIエラー (${model}):`, errorData);
      return c.json(
        { error: "画像生成に失敗しました", details: errorData, model },
        response.status as 400
      );
    }

    const data = (await response.json()) as GeminiResponse;

    // レスポンスからinlineData（画像）を探す
    const responseParts = data.candidates?.[0]?.content?.parts;
    if (responseParts) {
      for (const part of responseParts) {
        if ("inlineData" in part) {
          const url = await saveImageToR2(
            c.env.UPLOADS,
            part.inlineData.data,
            part.inlineData.mimeType,
            "avatar"
          );
          return c.json({ url });
        }
      }
    }

    return c.json({ error: "画像が生成されませんでした", model }, 500);
  } catch (error) {
    console.error("アバター生成エラー:", error);
    return c.json({ error: "画像生成サービスへの接続に失敗しました" }, 502);
  }
});
