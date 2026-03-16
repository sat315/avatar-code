import { Hono } from "hono";
import type { Bindings } from "../index";
import {
  findImageModel,
  fetchImageAsBase64,
  callGemini,
  saveImageToR2,
  type GeminiResponse,
  type GeminiPart,
} from "../utils/gemini";

export const selfieRoute = new Hono<{ Bindings: Bindings }>();

/** personas テーブルから取得する行の型 */
interface PersonaRow {
  avatar_url: string | null;
  appearance: string | null;
  costume_url: string | null;
}

/**
 * POST /api/selfie/generate
 * ペルソナのアクティブ衣装を参照画像として Gemini で自撮り画像を生成する。
 * ユーザーが「〇〇で自撮りして」と言うとフロントが呼び出す。
 */
selfieRoute.post("/generate", async (c) => {
  const body = await c.req.json<{ personaId: number; prompt: string }>();
  const { personaId, prompt } = body;

  if (!prompt) {
    return c.json({ error: "プロンプトが必要です" }, 400);
  }
  if (!personaId) {
    return c.json({ error: "personaId が必要です" }, 400);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Gemini APIキーがサーバーに設定されていません" }, 500);
  }

  // ペルソナのアクティブ衣装 URL（なければ avatar_url）と appearance を取得
  const persona = await c.env.DB.prepare(`
    SELECT p.avatar_url, p.appearance, c.image_url AS costume_url
    FROM personas p
    LEFT JOIN costumes c ON c.id = p.active_costume_id
    WHERE p.id = ?
  `).bind(personaId).first<PersonaRow>();

  const referenceImageUrl = persona?.costume_url || persona?.avatar_url || null;
  const appearance = persona?.appearance;

  // 利用可能なモデルを自動検出
  const model = await findImageModel(apiKey);
  if (!model) {
    return c.json({ error: "画像生成に対応したモデルが見つかりませんでした" }, 400);
  }
  console.log("自撮り生成 - 使用モデル:", model);

  // 自撮り用プロンプト構築
  const enhancedPrompt = referenceImageUrl
    ? [
        "【重要】添付画像のキャラクターと完全に同一人物を描いてください。",
        "以下の特徴を絶対に変えないでください：",
        appearance
          ? `- キャラクターの外見: ${appearance}`
          : "- 顔立ち、目の色、髪の色をそのまま維持",
        "",
        `シーン・表情・ポーズ: ${prompt}`,
        "",
        "ルール:",
        "- 顔立ち、目の色、髪の色は添付画像と完全一致させること",
        "- 衣装は添付画像のままにすること（変更指示がある場合のみ変更）",
        "- 自撮り風のアングル（近距離・正面よりやや上からのカメラアングル）",
        "- 高品質なアニメ風イラスト、明るくポップな雰囲気",
        "- テキストなし",
      ].join("\n")
    : [
        "Generate a single high quality anime-style character portrait, selfie-style.",
        "Close-up shot, slightly upward camera angle as if holding the camera.",
        "Vibrant colors, detailed illustration, no text.",
        appearance ? `Character appearance: ${appearance}.` : "",
        prompt,
      ].filter(Boolean).join(" ");

  try {
    const parts: GeminiPart[] = [];

    // 参照画像がある場合は R2 / 外部URL から取得して multimodal 入力に追加
    if (referenceImageUrl) {
      const imageData = await fetchImageAsBase64(referenceImageUrl, c.env.UPLOADS);
      if (imageData) {
        parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } });
        console.log("参照画像取得成功:", imageData.mimeType);
      } else {
        console.warn("参照画像が見つかりません（テキストのみで生成）:", referenceImageUrl);
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
    const responseParts = data.candidates?.[0]?.content?.parts;

    if (responseParts) {
      for (const part of responseParts) {
        if ("inlineData" in part) {
          const url = await saveImageToR2(
            c.env.UPLOADS,
            part.inlineData.data,
            part.inlineData.mimeType,
            "selfie"
          );
          return c.json({ url });
        }
      }
    }

    return c.json({ error: "画像が生成されませんでした", model }, 500);
  } catch (error) {
    console.error("自撮り生成エラー:", error);
    return c.json({ error: "画像生成サービスへの接続に失敗しました" }, 502);
  }
});
