import { Hono } from "hono";
import type { Bindings } from "../index";
import {
  findImageModel,
  fetchImageAsBase64,
  callGeminiWithRetry,
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

  // costumeUrl はフロントエンドが「着る」ボタン経由で同期した avatar_url を優先使用する。
  // 未指定の場合は DB の active_costume_id → avatar_url の順にフォールバック。
  const referenceImageUrl = persona?.costume_url || persona?.avatar_url || null;
  const appearance = persona?.appearance;

  console.log("自撮り参照画像決定:", {
    costume_url: persona?.costume_url ?? "(なし)",
    avatar_url: persona?.avatar_url ?? "(なし)",
    使用URL: referenceImageUrl ?? "(なし・テキストのみ)",
  });

  // 利用可能なモデルを自動検出
  const model = await findImageModel(apiKey);
  if (!model) {
    return c.json({ error: "画像生成に対応したモデルが見つかりませんでした" }, 400);
  }
  console.log("自撮り生成 - 使用モデル:", model);

  // 自撮り用プロンプト構築
  const enhancedPrompt = referenceImageUrl
    ? [
        "添付画像のキャラクターと同一人物を描いてください。",
        "",
        "【参照画像から必ず引き継ぐもの（変えないこと）】",
        "- 顔立ち・目の色",
        "- 衣装・服装・アクセサリー（プロンプト中に別の服装が書かれていても無視すること）",
        "",
        "【髪型・髪の色について】",
        "- 指示がない場合は参照画像の髪型・髪の色をそのまま維持すること",
        "- 指示がある場合はその指示通りの髪型・髪の色に変更すること",
        "",
        "【参照画像から必ず変えること（以下の指示に従うこと）】",
        "- ポーズ・体勢・シーン・背景・表情はすべて以下の指示通りに描くこと",
        "- 参照画像のポーズをそのまま引き継がないこと",
        "",
        `【シーン・ポーズ・表情の指示（必ず従うこと）】: ${prompt}`,
        "",
        "その他: 高品質アニメ風イラスト、テキストなし",
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

    const response = await callGeminiWithRetry(apiKey, model, parts);

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
