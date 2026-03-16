import { Hono } from "hono";
import type { Bindings } from "../index";

// ブリッジサーバーのリモートデプロイルート
export const deployRoute = new Hono<{ Bindings: Bindings }>();

/**
 * POST /api/deploy
 * ブリッジサーバーにgit pull＋再起動を指示する
 */
deployRoute.post("/", async (c) => {
  // API認証ミドルウェアで認証済みのため、追加チェック不要
  try {
    const bridgeUrl = `${c.env.BRIDGE_URL}/deploy`;
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.BRIDGE_SECRET}`,
      },
      signal: AbortSignal.timeout(60_000),
    });

    const data = await response.json();
    return c.json(data as Record<string, unknown>, response.ok ? 200 : 502);
  } catch (error) {
    console.error("デプロイリクエストエラー:", error);
    return c.json(
      { status: "error", message: "ブリッジサーバーに接続できません" },
      503
    );
  }
});
