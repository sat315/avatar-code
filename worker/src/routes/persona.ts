import { Hono } from "hono";
import type { Bindings } from "../index";

// ペルソナCRUDルート
export const personaRoute = new Hono<{ Bindings: Bindings }>();

// ペルソナの型定義
type Persona = {
  id: number;
  name: string;
  system_prompt: string;
  avatar_url: string | null;
  appearance: string | null;
  active_costume_id: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * GET /api/persona
 * ペルソナ一覧を取得する
 */
personaRoute.get("/", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM personas ORDER BY updated_at DESC"
    ).all<Persona>();

    return c.json({ personas: results });
  } catch (error) {
    console.error("ペルソナ一覧取得エラー:", error);
    return c.json({ error: "ペルソナの取得に失敗しました" }, 500);
  }
});

/**
 * GET /api/persona/:id
 * 指定IDのペルソナを取得する
 */
personaRoute.get("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const persona = await c.env.DB.prepare(
      "SELECT * FROM personas WHERE id = ?"
    )
      .bind(id)
      .first<Persona>();

    if (!persona) {
      return c.json({ error: "ペルソナが見つかりません" }, 404);
    }

    return c.json({ persona });
  } catch (error) {
    console.error("ペルソナ取得エラー:", error);
    return c.json({ error: "ペルソナの取得に失敗しました" }, 500);
  }
});

/**
 * POST /api/persona
 * 新しいペルソナを作成する
 *
 * リクエストボディ:
 * - name: ペルソナの名前
 * - systemPrompt: 性格を定義するシステムプロンプト
 * - avatarUrl: アバター画像のURL（任意）
 */
personaRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { name, systemPrompt, avatarUrl, appearance } = body;

  // バリデーション
  if (!name || !systemPrompt) {
    return c.json({ error: "名前と性格プロンプトは必須です" }, 400);
  }

  // 文字数上限バリデーション
  if (name.length > 50) {
    return c.json({ error: "名前は50文字以内にしてください" }, 400);
  }
  if (systemPrompt.length > 10000) {
    return c.json({ error: "性格プロンプトは10000文字以内にしてください" }, 400);
  }
  if (avatarUrl && avatarUrl.length > 2000) {
    return c.json({ error: "アバターURLは2000文字以内にしてください" }, 400);
  }
  if (appearance && appearance.length > 2000) {
    return c.json({ error: "外見定義は2000文字以内にしてください" }, 400);
  }

  try {
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(
      `INSERT INTO personas (name, system_prompt, avatar_url, appearance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(name, systemPrompt, avatarUrl || null, appearance || null, now, now)
      .run();

    // 作成したペルソナを返す
    const persona = await c.env.DB.prepare(
      "SELECT * FROM personas WHERE id = ?"
    )
      .bind(result.meta.last_row_id)
      .first<Persona>();

    return c.json({ persona }, 201);
  } catch (error) {
    console.error("ペルソナ作成エラー:", error);
    return c.json({ error: "ペルソナの作成に失敗しました" }, 500);
  }
});

/**
 * PUT /api/persona/:id
 * ペルソナを更新する
 */
personaRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { name, systemPrompt, avatarUrl, appearance } = body;

  // 更新対象の存在確認
  const existing = await c.env.DB.prepare(
    "SELECT * FROM personas WHERE id = ?"
  )
    .bind(id)
    .first<Persona>();

  if (!existing) {
    return c.json({ error: "ペルソナが見つかりません" }, 404);
  }

  // 文字数上限バリデーション（指定されたフィールドのみ検証）
  if (name !== undefined && name.length > 50) {
    return c.json({ error: "名前は50文字以内にしてください" }, 400);
  }
  if (systemPrompt !== undefined && systemPrompt.length > 10000) {
    return c.json({ error: "性格プロンプトは10000文字以内にしてください" }, 400);
  }
  if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl.length > 2000) {
    return c.json({ error: "アバターURLは2000文字以内にしてください" }, 400);
  }
  if (appearance !== undefined && appearance !== null && appearance.length > 2000) {
    return c.json({ error: "外見定義は2000文字以内にしてください" }, 400);
  }

  try {
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE personas
       SET name = ?, system_prompt = ?, avatar_url = ?, appearance = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        name ?? existing.name,
        systemPrompt ?? existing.system_prompt,
        avatarUrl !== undefined ? avatarUrl : existing.avatar_url,
        appearance !== undefined ? appearance : existing.appearance,
        now,
        id
      )
      .run();

    // 更新後のペルソナを返す
    const persona = await c.env.DB.prepare(
      "SELECT * FROM personas WHERE id = ?"
    )
      .bind(id)
      .first<Persona>();

    return c.json({ persona });
  } catch (error) {
    console.error("ペルソナ更新エラー:", error);
    return c.json({ error: "ペルソナの更新に失敗しました" }, 500);
  }
});

/**
 * DELETE /api/persona/:id
 * ペルソナと関連するメッセージを削除する
 */
personaRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // 削除対象の存在確認
  const existing = await c.env.DB.prepare(
    "SELECT * FROM personas WHERE id = ?"
  )
    .bind(id)
    .first<Persona>();

  if (!existing) {
    return c.json({ error: "ペルソナが見つかりません" }, 404);
  }

  try {
    // 関連メッセージも削除（外部キー制約のバックアップ）
    await c.env.DB.prepare("DELETE FROM messages WHERE persona_id = ?")
      .bind(id)
      .run();

    await c.env.DB.prepare("DELETE FROM personas WHERE id = ?")
      .bind(id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("ペルソナ削除エラー:", error);
    return c.json({ error: "ペルソナの削除に失敗しました" }, 500);
  }
});
