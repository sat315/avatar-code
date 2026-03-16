import { Hono } from "hono";
import type { Bindings } from "../index";

// メッセージ会話履歴ルート
export const messagesRoute = new Hono<{ Bindings: Bindings }>();

// メッセージの型定義
type Message = {
  id: number;
  persona_id: number;
  session_id: string | null;
  role: "user" | "assistant";
  content: string;
  image_url: string | null;
  usage_json: string | null;
  generated_images_json: string | null;
  created_at: string;
};

/**
 * GET /api/messages/session/:sessionId
 * セッションの会話履歴を取得する（古い順 = チャット表示順）
 *
 * クエリパラメータ:
 * - limit: 取得件数（デフォルト200、最大1000）
 * - offset: オフセット（デフォルト0）
 *
 * ※ /:personaId より先に定義（Honoのルーティング優先順位対策）
 */
messagesRoute.get("/session/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const limit = Math.min(Number(c.req.query("limit") || 200), 1000);
  const offset = Number(c.req.query("offset") || 0);

  // パラメータのバリデーション
  if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
    return c.json({ error: "limitまたはoffsetが不正です" }, 400);
  }

  try {
    // 最新N件を取得するためサブクエリで降順→外側で昇順に並べ替え
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM (
        SELECT id, persona_id, session_id, role, content, image_url, usage_json, generated_images_json, created_at
        FROM messages
        WHERE session_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      ) sub ORDER BY created_at ASC, id ASC`
    )
      .bind(sessionId, limit, offset)
      .all<Message>();

    return c.json({ messages: results });
  } catch (error) {
    console.error("セッションメッセージ取得エラー:", error);
    return c.json({ error: "メッセージの取得に失敗しました" }, 500);
  }
});

/**
 * GET /api/messages/:personaId
 * ペルソナの会話履歴を取得する（古い順 = チャット表示順）
 *
 * クエリパラメータ:
 * - limit: 取得件数（デフォルト200、最大1000）
 * - offset: オフセット（デフォルト0）
 */
messagesRoute.get("/:personaId", async (c) => {
  const personaId = c.req.param("personaId");
  const limit = Math.min(Number(c.req.query("limit") || 200), 1000);
  const offset = Number(c.req.query("offset") || 0);

  // パラメータのバリデーション
  if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
    return c.json({ error: "limitまたはoffsetが不正です" }, 400);
  }

  try {
    // セッションに紐づかないメッセージのみ取得（フォルダなし時用）
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM (
        SELECT id, persona_id, role, content, image_url, usage_json, generated_images_json, created_at
        FROM messages
        WHERE persona_id = ? AND session_id IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      ) sub ORDER BY created_at ASC, id ASC`
    )
      .bind(personaId, limit, offset)
      .all<Message>();

    return c.json({ messages: results });
  } catch (error) {
    console.error("メッセージ取得エラー:", error);
    return c.json({ error: "メッセージの取得に失敗しました" }, 500);
  }
});

/**
 * POST /api/messages
 * メッセージを1件保存する
 *
 * リクエストボディ:
 * - personaId: ペルソナID
 * - role: "user" | "assistant"
 * - content: メッセージ本文
 * - sessionId: セッションID（任意、指定時はsession_idにも保存）
 */
messagesRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { personaId, role, content } = body;

  // バリデーション
  if (!personaId || !role || !content) {
    return c.json({ error: "personaId, role, contentは必須です" }, 400);
  }

  if (role !== "user" && role !== "assistant") {
    return c.json({ error: "roleは'user'または'assistant'のみ有効です" }, 400);
  }

  // 文字数上限バリデーション
  if (content.length > 100000) {
    return c.json({ error: "メッセージは100000文字以内にしてください" }, 400);
  }

  const imageUrl = body.imageUrl || null;
  const sessionId = body.sessionId || null;
  const usageJson = body.usage ? JSON.stringify(body.usage) : null;

  // 画像URL文字数バリデーション
  if (imageUrl && imageUrl.length > 2000) {
    return c.json({ error: "画像URLは2000文字以内にしてください" }, 400);
  }

  try {
    // ペルソナの存在確認
    const persona = await c.env.DB.prepare(
      "SELECT id FROM personas WHERE id = ?"
    )
      .bind(personaId)
      .first();

    if (!persona) {
      return c.json({ error: "指定されたペルソナが見つかりません" }, 404);
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO messages (persona_id, session_id, role, content, image_url, usage_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(personaId, sessionId, role, content, imageUrl, usageJson)
      .run();

    // 保存したメッセージを返す
    const message = await c.env.DB.prepare(
      "SELECT id, persona_id, session_id, role, content, image_url, usage_json, created_at FROM messages WHERE id = ?"
    )
      .bind(result.meta.last_row_id)
      .first<Message>();

    return c.json({ message }, 201);
  } catch (error) {
    console.error("メッセージ保存エラー:", error);
    return c.json({ error: "メッセージの保存に失敗しました" }, 500);
  }
});

/**
 * POST /api/messages/batch
 * メッセージを一括保存する（ユーザーメッセージとAI応答をまとめて保存）
 *
 * リクエストボディ:
 * - personaId: ペルソナID
 * - sessionId: セッションID（任意、指定時はsession_idにも保存）
 * - messages: Array<{ role: "user" | "assistant", content: string, imageUrl?: string }>
 */
messagesRoute.post("/batch", async (c) => {
  const body = await c.req.json();
  const { personaId, messages } = body;
  const sessionId = body.sessionId || null;

  // バリデーション
  if (!personaId || !Array.isArray(messages) || messages.length === 0) {
    return c.json(
      { error: "personaIdと1件以上のmessages配列は必須です" },
      400
    );
  }

  // 一括保存件数の上限バリデーション
  if (messages.length > 100) {
    return c.json({ error: "一括保存は100件以内にしてください" }, 400);
  }

  // 各メッセージのバリデーション
  for (const msg of messages) {
    if (!msg.role || (!msg.content && !msg.imageUrl)) {
      return c.json(
        { error: "各メッセージにはroleとcontent（またはimageUrl）が必要です" },
        400
      );
    }
    if (msg.role !== "user" && msg.role !== "assistant") {
      return c.json(
        { error: "roleは'user'または'assistant'のみ有効です" },
        400
      );
    }
    // 文字数上限バリデーション
    if (msg.content && msg.content.length > 100000) {
      return c.json(
        { error: "各メッセージは100000文字以内にしてください" },
        400
      );
    }
    // 画像URL文字数バリデーション
    if (msg.imageUrl && msg.imageUrl.length > 2000) {
      return c.json(
        { error: "画像URLは2000文字以内にしてください" },
        400
      );
    }
  }

  try {
    // ペルソナの存在確認
    const persona = await c.env.DB.prepare(
      "SELECT id FROM personas WHERE id = ?"
    )
      .bind(personaId)
      .first();

    if (!persona) {
      return c.json({ error: "指定されたペルソナが見つかりません" }, 404);
    }

    // D1のbatch APIで一括挿入
    const statements = messages.map((msg: { role: string; content: string; imageUrl?: string; usage?: unknown }) =>
      c.env.DB.prepare(
        `INSERT INTO messages (persona_id, session_id, role, content, image_url, usage_json) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(personaId, sessionId, msg.role, msg.content, msg.imageUrl || null, msg.usage ? JSON.stringify(msg.usage) : null)
    );

    const batchResults = await c.env.DB.batch(statements);
    const ids = batchResults.map((r) => r.meta.last_row_id as number);

    return c.json({ success: true, count: messages.length, ids }, 201);
  } catch (error) {
    console.error("メッセージ一括保存エラー:", error);
    return c.json({ error: "メッセージの一括保存に失敗しました" }, 500);
  }
});

/**
 * PATCH /api/messages/:id
 * メッセージの generated_images_json を更新する（自撮り・画像生成完了後）
 *
 * リクエストボディ:
 * - generatedImages: string[] — 生成画像URLの配列
 */
messagesRoute.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id) || id < 1) {
    return c.json({ error: "idが不正です" }, 400);
  }

  const body = await c.req.json<{ generatedImages: string[] }>();
  if (!Array.isArray(body.generatedImages)) {
    return c.json({ error: "generatedImagesは配列が必要です" }, 400);
  }

  try {
    await c.env.DB.prepare(
      "UPDATE messages SET generated_images_json = ? WHERE id = ?"
    )
      .bind(JSON.stringify(body.generatedImages), id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("メッセージ更新エラー:", error);
    return c.json({ error: "メッセージの更新に失敗しました" }, 500);
  }
});

/**
 * DELETE /api/messages/after/:messageId
 * 指定メッセージIDより後のメッセージを削除する（会話巻き戻し用）
 *
 * クエリパラメータ:
 * - session_id: セッションID（任意、指定時はそのセッション内のみ対象）
 */
messagesRoute.delete("/after/:messageId", async (c) => {
  const messageId = Number(c.req.param("messageId"));
  const sessionId = c.req.query("session_id");

  // バリデーション
  if (isNaN(messageId) || messageId < 1) {
    return c.json({ error: "messageIdが不正です" }, 400);
  }

  try {
    let result;

    if (sessionId) {
      // セッション指定時: そのセッション内のみ削除
      result = await c.env.DB.prepare(
        "DELETE FROM messages WHERE id > ? AND session_id = ?"
      )
        .bind(messageId, sessionId)
        .run();
    } else {
      // セッション未指定時: 対象メッセージのpersona_id内で削除
      result = await c.env.DB.prepare(
        "DELETE FROM messages WHERE id > ? AND persona_id = (SELECT persona_id FROM messages WHERE id = ?)"
      )
        .bind(messageId, messageId)
        .run();
    }

    return c.json({ success: true, deletedCount: result.meta.changes });
  } catch (error) {
    console.error("メッセージ巻き戻しエラー:", error);
    return c.json({ error: "メッセージの巻き戻しに失敗しました" }, 500);
  }
});

/**
 * DELETE /api/messages/session/:sessionId
 * セッションの会話履歴をすべて削除する
 */
messagesRoute.delete("/session/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    await c.env.DB.prepare("DELETE FROM messages WHERE session_id = ?")
      .bind(sessionId)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("セッションメッセージ削除エラー:", error);
    return c.json({ error: "セッションメッセージの削除に失敗しました" }, 500);
  }
});

/**
 * DELETE /api/messages/:personaId
 * ペルソナの会話履歴をすべて削除する
 */
messagesRoute.delete("/:personaId", async (c) => {
  const personaId = c.req.param("personaId");

  try {
    await c.env.DB.prepare("DELETE FROM messages WHERE persona_id = ?")
      .bind(personaId)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("メッセージ削除エラー:", error);
    return c.json({ error: "メッセージの削除に失敗しました" }, 500);
  }
});
