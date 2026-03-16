import { Hono } from "hono";
import type { Bindings } from "../index";

// セッション（フォルダに紐づく会話）CRUDルート
export const sessionsRoute = new Hono<{ Bindings: Bindings }>();

// セッションの型定義
type Session = {
  id: string;
  folder_id: string;
  title: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

/**
 * GET /api/sessions/:folderId
 * フォルダのセッション一覧を取得する（作成日降順）
 */
sessionsRoute.get("/:folderId", async (c) => {
  const folderId = c.req.param("folderId");

  try {
    // フォルダの存在確認
    const folder = await c.env.DB.prepare(
      "SELECT id FROM folders WHERE id = ?"
    )
      .bind(folderId)
      .first();

    if (!folder) {
      return c.json({ error: "フォルダが見つかりません" }, 404);
    }

    const { results } = await c.env.DB.prepare(
      "SELECT * FROM sessions WHERE folder_id = ? ORDER BY created_at DESC"
    )
      .bind(folderId)
      .all<Session>();

    return c.json({ sessions: results });
  } catch (error) {
    console.error("セッション一覧取得エラー:", error);
    return c.json({ error: "セッションの取得に失敗しました" }, 500);
  }
});

/**
 * POST /api/sessions
 * 新しいセッションを作成する
 *
 * リクエストボディ:
 * - folder_id: フォルダID（必須）
 * - title: セッションタイトル（任意）
 */
sessionsRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { folder_id, title } = body;

  // バリデーション
  if (!folder_id) {
    return c.json({ error: "folder_idは必須です" }, 400);
  }

  try {
    // フォルダの存在確認
    const folder = await c.env.DB.prepare(
      "SELECT id FROM folders WHERE id = ?"
    )
      .bind(folder_id)
      .first();

    if (!folder) {
      return c.json({ error: "指定されたフォルダが見つかりません" }, 404);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO sessions (id, folder_id, title, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    )
      .bind(id, folder_id, title || null, now, now)
      .run();

    // 作成したセッションを返す
    const session = await c.env.DB.prepare(
      "SELECT * FROM sessions WHERE id = ?"
    )
      .bind(id)
      .first<Session>();

    return c.json({ session }, 201);
  } catch (error) {
    console.error("セッション作成エラー:", error);
    return c.json({ error: "セッションの作成に失敗しました" }, 500);
  }
});

/**
 * PUT /api/sessions/:id
 * セッションを更新する
 *
 * リクエストボディ（すべて任意）:
 * - title: セッションタイトル
 * - is_active: アクティブフラグ（0 or 1）
 */
sessionsRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { title, is_active } = body;

  // 更新対象の存在確認
  const existing = await c.env.DB.prepare(
    "SELECT * FROM sessions WHERE id = ?"
  )
    .bind(id)
    .first<Session>();

  if (!existing) {
    return c.json({ error: "セッションが見つかりません" }, 404);
  }

  // is_activeのバリデーション
  if (is_active !== undefined && is_active !== 0 && is_active !== 1) {
    return c.json({ error: "is_activeは0または1のみ有効です" }, 400);
  }

  try {
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE sessions
       SET title = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        title !== undefined ? title : existing.title,
        is_active !== undefined ? is_active : existing.is_active,
        now,
        id
      )
      .run();

    // 更新後のセッションを返す
    const session = await c.env.DB.prepare(
      "SELECT * FROM sessions WHERE id = ?"
    )
      .bind(id)
      .first<Session>();

    return c.json({ session });
  } catch (error) {
    console.error("セッション更新エラー:", error);
    return c.json({ error: "セッションの更新に失敗しました" }, 500);
  }
});

/**
 * DELETE /api/sessions/:id
 * セッションを削除する
 */
sessionsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // 削除対象の存在確認
  const existing = await c.env.DB.prepare(
    "SELECT * FROM sessions WHERE id = ?"
  )
    .bind(id)
    .first<Session>();

  if (!existing) {
    return c.json({ error: "セッションが見つかりません" }, 404);
  }

  try {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("セッション削除エラー:", error);
    return c.json({ error: "セッションの削除に失敗しました" }, 500);
  }
});
