import { Hono } from "hono";
import type { Bindings } from "../index";

// 衣装CRUDルート
export const costumesRoute = new Hono<{ Bindings: Bindings }>();

type Costume = {
  id: number;
  persona_id: number;
  label: string;
  image_url: string;
  created_at: string;
};

/**
 * GET /api/costumes?persona_id=:id
 * 指定ペルソナの衣装一覧を取得する
 */
costumesRoute.get("/", async (c) => {
  const personaId = c.req.query("persona_id");
  if (!personaId) {
    return c.json({ error: "persona_id is required" }, 400);
  }
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM costumes WHERE persona_id = ? ORDER BY created_at ASC"
    ).bind(personaId).all<Costume>();
    return c.json({ costumes: results });
  } catch (error) {
    console.error("衣装一覧取得エラー:", error);
    return c.json({ error: "衣装の取得に失敗しました" }, 500);
  }
});

/**
 * POST /api/costumes
 * 衣装を追加する
 */
costumesRoute.post("/", async (c) => {
  const body = await c.req.json<{
    personaId: number;
    label: string;
    imageUrl: string;
  }>();

  if (!body.personaId || !body.label || !body.imageUrl) {
    return c.json({ error: "personaId, label, imageUrl are required" }, 400);
  }
  if (body.label.length > 100) {
    return c.json({ error: "label must be 100 chars or less" }, 400);
  }

  try {
    const result = await c.env.DB.prepare(
      "INSERT INTO costumes (persona_id, label, image_url) VALUES (?, ?, ?)"
    ).bind(body.personaId, body.label, body.imageUrl).run();

    const costume = await c.env.DB.prepare(
      "SELECT * FROM costumes WHERE id = ?"
    ).bind(result.meta.last_row_id).first<Costume>();

    return c.json({ costume }, 201);
  } catch (error) {
    console.error("衣装追加エラー:", error);
    return c.json({ error: "衣装の追加に失敗しました" }, 500);
  }
});

/**
 * PUT /api/costumes/:id
 * 衣装のラベルを更新する
 */
costumesRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ label: string }>();

  if (!body.label) {
    return c.json({ error: "label is required" }, 400);
  }
  if (body.label.length > 100) {
    return c.json({ error: "label must be 100 chars or less" }, 400);
  }

  try {
    await c.env.DB.prepare(
      "UPDATE costumes SET label = ? WHERE id = ?"
    ).bind(body.label, id).run();
    return c.json({ success: true });
  } catch (error) {
    console.error("衣装更新エラー:", error);
    return c.json({ error: "衣装の更新に失敗しました" }, 500);
  }
});

/**
 * DELETE /api/costumes/:id
 * 衣装を削除する。アクティブ衣装の場合は別の衣装にフォールバック
 */
costumesRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const costume = await c.env.DB.prepare(
      "SELECT * FROM costumes WHERE id = ?"
    ).bind(id).first<Costume>();

    if (!costume) {
      return c.json({ error: "衣装が見つかりません" }, 404);
    }

    const persona = await c.env.DB.prepare(
      "SELECT active_costume_id FROM personas WHERE id = ?"
    ).bind(costume.persona_id).first<{ active_costume_id: number | null }>();

    await c.env.DB.prepare("DELETE FROM costumes WHERE id = ?").bind(id).run();

    if (persona?.active_costume_id === costume.id) {
      const fallback = await c.env.DB.prepare(
        "SELECT id, image_url FROM costumes WHERE persona_id = ? ORDER BY created_at ASC LIMIT 1"
      ).bind(costume.persona_id).first<{ id: number; image_url: string }>();

      if (fallback) {
        await c.env.DB.prepare(
          "UPDATE personas SET active_costume_id = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(fallback.id, fallback.image_url, costume.persona_id).run();
      } else {
        await c.env.DB.prepare(
          "UPDATE personas SET active_costume_id = NULL, avatar_url = NULL, updated_at = datetime('now') WHERE id = ?"
        ).bind(costume.persona_id).run();
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("衣装削除エラー:", error);
    return c.json({ error: "衣装の削除に失敗しました" }, 500);
  }
});

/**
 * POST /api/costumes/:id/activate
 * 衣装を着用する（persona.active_costume_id + avatar_urlを同期更新）
 */
costumesRoute.post("/:id/activate", async (c) => {
  const id = c.req.param("id");

  try {
    const costume = await c.env.DB.prepare(
      "SELECT * FROM costumes WHERE id = ?"
    ).bind(id).first<Costume>();

    if (!costume) {
      return c.json({ error: "衣装が見つかりません" }, 404);
    }

    await c.env.DB.prepare(
      "UPDATE personas SET active_costume_id = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(costume.id, costume.image_url, costume.persona_id).run();

    return c.json({ success: true, avatarUrl: costume.image_url });
  } catch (error) {
    console.error("衣装着用エラー:", error);
    return c.json({ error: "衣装の着用に失敗しました" }, 500);
  }
});
