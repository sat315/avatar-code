import { Hono } from "hono";
import type { Bindings } from "../index";

// フォルダ（プロジェクト）CRUDルート
export const foldersRoute = new Hono<{ Bindings: Bindings }>();

// フォルダの型定義
type Folder = {
  id: string;
  name: string;
  path: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * GET /api/folders
 * フォルダ一覧を取得する（sort_order順）
 */
foldersRoute.get("/", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM folders ORDER BY sort_order ASC, created_at ASC"
    ).all<Folder>();

    return c.json({ folders: results });
  } catch (error) {
    console.error("フォルダ一覧取得エラー:", error);
    return c.json({ error: "フォルダの取得に失敗しました" }, 500);
  }
});

/**
 * POST /api/folders
 * 新しいフォルダを作成する
 *
 * リクエストボディ:
 * - name: フォルダ名（必須、100文字以内）
 * - path: フォルダパス（必須、500文字以内）
 */
foldersRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { name, path } = body;

  // バリデーション
  if (!name || !path) {
    return c.json({ error: "nameとpathは必須です" }, 400);
  }

  if (typeof name !== "string" || name.length > 100) {
    return c.json({ error: "nameは100文字以内にしてください" }, 400);
  }

  if (typeof path !== "string" || path.length > 500) {
    return c.json({ error: "pathは500文字以内にしてください" }, 400);
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // 現在の最大sort_orderを取得して末尾に追加
    const maxOrder = await c.env.DB.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM folders"
    ).first<{ max_order: number }>();

    const sortOrder = (maxOrder?.max_order ?? -1) + 1;

    await c.env.DB.prepare(
      `INSERT INTO folders (id, name, path, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(id, name, path, sortOrder, now, now)
      .run();

    // 作成したフォルダを返す
    const folder = await c.env.DB.prepare(
      "SELECT * FROM folders WHERE id = ?"
    )
      .bind(id)
      .first<Folder>();

    return c.json({ folder }, 201);
  } catch (error) {
    console.error("フォルダ作成エラー:", error);
    return c.json({ error: "フォルダの作成に失敗しました" }, 500);
  }
});

/**
 * PUT /api/folders/reorder
 * フォルダの並び順を変更する
 *
 * リクエストボディ:
 * - ids: フォルダIDの配列（並び順通り）
 */
foldersRoute.put("/reorder", async (c) => {
  const body = await c.req.json();
  const { ids } = body;

  // バリデーション
  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: "ids配列は必須です" }, 400);
  }

  try {
    // バッチでsort_orderを更新
    const statements = ids.map((id: string, index: number) =>
      c.env.DB.prepare(
        "UPDATE folders SET sort_order = ?, updated_at = ? WHERE id = ?"
      ).bind(index, new Date().toISOString(), id)
    );

    await c.env.DB.batch(statements);

    return c.json({ success: true });
  } catch (error) {
    console.error("フォルダ並び替えエラー:", error);
    return c.json({ error: "フォルダの並び替えに失敗しました" }, 500);
  }
});

/**
 * PUT /api/folders/:id
 * フォルダを更新する
 *
 * リクエストボディ（すべて任意）:
 * - name: フォルダ名（100文字以内）
 * - path: フォルダパス（500文字以内）
 * - sort_order: 並び順
 */
foldersRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { name, path, sort_order } = body;

  // 更新対象の存在確認
  const existing = await c.env.DB.prepare(
    "SELECT * FROM folders WHERE id = ?"
  )
    .bind(id)
    .first<Folder>();

  if (!existing) {
    return c.json({ error: "フォルダが見つかりません" }, 404);
  }

  // バリデーション（指定されたフィールドのみ検証）
  if (name !== undefined && (typeof name !== "string" || name.length > 100)) {
    return c.json({ error: "nameは100文字以内にしてください" }, 400);
  }

  if (path !== undefined && (typeof path !== "string" || path.length > 500)) {
    return c.json({ error: "pathは500文字以内にしてください" }, 400);
  }

  try {
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE folders
       SET name = ?, path = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        name ?? existing.name,
        path ?? existing.path,
        sort_order ?? existing.sort_order,
        now,
        id
      )
      .run();

    // 更新後のフォルダを返す
    const folder = await c.env.DB.prepare(
      "SELECT * FROM folders WHERE id = ?"
    )
      .bind(id)
      .first<Folder>();

    return c.json({ folder });
  } catch (error) {
    console.error("フォルダ更新エラー:", error);
    return c.json({ error: "フォルダの更新に失敗しました" }, 500);
  }
});

/**
 * DELETE /api/folders/:id
 * フォルダと関連セッションを削除する（カスケード削除）
 */
foldersRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // 削除対象の存在確認
  const existing = await c.env.DB.prepare(
    "SELECT * FROM folders WHERE id = ?"
  )
    .bind(id)
    .first<Folder>();

  if (!existing) {
    return c.json({ error: "フォルダが見つかりません" }, 404);
  }

  try {
    // 関連セッションのIDを取得
    const { results: relatedSessions } = await c.env.DB.prepare(
      "SELECT id FROM sessions WHERE folder_id = ?"
    ).bind(id).all<{ id: string }>();

    // 関連セッションのメッセージを削除
    if (relatedSessions.length > 0) {
      for (const session of relatedSessions) {
        await c.env.DB.prepare("DELETE FROM messages WHERE session_id = ?")
          .bind(session.id)
          .run();
      }
    }

    // 関連セッションを削除
    await c.env.DB.prepare("DELETE FROM sessions WHERE folder_id = ?")
      .bind(id)
      .run();

    // フォルダを削除
    await c.env.DB.prepare("DELETE FROM folders WHERE id = ?")
      .bind(id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("フォルダ削除エラー:", error);
    return c.json({ error: "フォルダの削除に失敗しました" }, 500);
  }
});
