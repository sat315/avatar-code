import { Hono } from "hono";
import type { Bindings } from "../index";

/**
 * 動的 PWA マニフェストエンドポイント（認証不要）
 * GET /api/manifest?personaId=xxx
 * アクティブなペルソナのアバターをアイコンとして返す
 */
export const manifestRoute = new Hono<{ Bindings: Bindings }>();

manifestRoute.get("/", async (c) => {
  const personaId = c.req.query("personaId");
  const origin = new URL(c.req.url).origin;

  let iconUrl: string | null = null;

  if (personaId) {
    try {
      const persona = await c.env.DB.prepare(`
        SELECT p.avatar_url, c.image_url AS costume_url
        FROM personas p
        LEFT JOIN costumes c ON c.id = p.active_costume_id
        WHERE p.id = ?
      `).bind(personaId).first<{ avatar_url: string | null; costume_url: string | null }>();

      const imageUrl = persona?.costume_url || persona?.avatar_url;
      if (imageUrl) {
        iconUrl = imageUrl.startsWith("http") ? imageUrl : `${origin}${imageUrl}`;
      }
    } catch (e) {
      console.error("manifest: persona取得エラー", e);
    }
  }

  const icons = iconUrl
    ? [{ src: iconUrl, sizes: "any", type: "image/png", purpose: "any maskable" }]
    : [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ];

  const manifest = {
    name: "AvatarCode",
    short_name: "AvatarCode",
    description: "あなただけのAIキャラクターとチャット",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#5865F2",
    icons,
  };

  return c.body(JSON.stringify(manifest), 200, {
    "Content-Type": "application/manifest+json",
    "Cache-Control": "no-cache, no-store",
  });
});
