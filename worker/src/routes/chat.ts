import { Hono } from "hono";
import type { Bindings } from "../index";

// ブリッジサーバー経由のClaude Code CLIプロキシルート
export const chatRoute = new Hono<{ Bindings: Bindings }>();

/**
 * POST /api/chat
 * ブリッジサーバーへのプロキシ。SSEストリーミング対応。
 *
 * リクエストボディ:
 * - messages: メッセージ配列 [{role, content}]
 * - system: システムプロンプト（ペルソナの性格）
 *
 * ブリッジへ送信する形式:
 * - message: 最後のuserメッセージ
 * - systemPrompt: システムプロンプト
 * - history: それ以前のメッセージ配列
 */
chatRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { messages, system } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: "メッセージが必要です" }, 400);
  }

  // 最後のuserメッセージを取り出し、残りをhistoryにする
  const lastUserIndex = messages.length - 1;
  const lastMessage = messages[lastUserIndex];
  const history = messages.slice(0, lastUserIndex);

  // ペルソナ名をD1から取得してシステムプロンプトに埋め込む
  let enrichedSystem = system;
  if (body.personaId) {
    try {
      const row = await c.env.DB.prepare(
        "SELECT name FROM personas WHERE id = ?"
      ).bind(Number(body.personaId)).first<{ name: string }>();
      if (row?.name && enrichedSystem) {
        enrichedSystem = `あなたの名前は「${row.name}」です。この名前で自己紹介し、この名前で呼ばれたら反応してください。\n\n${enrichedSystem}`;
      }
    } catch (e) {
      console.error("ペルソナ名取得エラー:", e);
    }
  }

  // 最後のuserメッセージの画像を取り出す
  const lastMessageImage = lastMessage.image;

  // ブリッジサーバーへ送信するボディを構築
  const bridgeBody: Record<string, unknown> = {
    message: lastMessage.content,
  };

  // 画像があればブリッジに渡す
  if (lastMessageImage) {
    bridgeBody.image = lastMessageImage;
  }

  if (enrichedSystem) {
    bridgeBody.systemPrompt = enrichedSystem;
  }

  // ペルソナIDをブリッジに渡す（ペルソナファイル解決用）
  if (body.personaId) {
    bridgeBody.personaId = String(body.personaId);
  }

  if (history.length > 0) {
    bridgeBody.history = history;
  }

  try {
    const bridgeUrl = `${c.env.BRIDGE_URL}/chat`;
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.BRIDGE_SECRET}`,
      },
      body: JSON.stringify(bridgeBody),
      // ツール実行で時間がかかるのでタイムアウトを20分に設定
      signal: AbortSignal.timeout(1_200_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("ブリッジサーバーエラー:", response.status, errText);
      return c.json(
        { error: "bridge_error", message: `ブリッジエラー: ${response.status}` },
        502
      );
    }

    // ブリッジからのSSEレスポンスをそのままクライアントにパススルー
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("ブリッジサーバー接続エラー:", error);
    // Tunnel切断 / PC電源OFFなどの場合
    return c.json(
      {
        error: "offline",
        message: "おやすみ中です💤 PCが起動していないかもしれません",
      },
      503
    );
  }
});

/**
 * GET /api/chat/projects
 * ブリッジサーバーからPROJECTS_DIR内のプロジェクト一覧を取得
 */
chatRoute.get("/projects", async (c) => {
  const url = `${c.env.BRIDGE_URL}/projects`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${c.env.BRIDGE_SECRET}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      const data = await response.json();
      return c.json(data);
    }

    const errText = await response.text().catch(() => "");
    console.error(`[projects] url=${url} status=${response.status} body=${errText}`);
    return c.json({ error: "ブリッジからプロジェクト一覧を取得できませんでした", bridgeUrl: url, status: response.status, detail: errText }, 502);
  } catch {
    return c.json({ error: "ブリッジに接続できません" }, 503);
  }
});

/**
 * GET /api/chat/files?path=xxx&extensions=.md,.txt
 * フォルダ内のファイルツリーをブリッジ経由で取得
 */
chatRoute.get("/files", async (c) => {
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path パラメータが必要です" }, 400);

  const params = new URLSearchParams({ path });
  const extensions = c.req.query("extensions");
  if (extensions) params.set("extensions", extensions);

  try {
    const response = await fetch(`${c.env.BRIDGE_URL}/files?${params}`, {
      headers: { Authorization: `Bearer ${c.env.BRIDGE_SECRET}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return c.json(await response.json());
    return c.json({ error: "ファイル一覧の取得に失敗しました" }, 502);
  } catch {
    return c.json({ error: "ブリッジに接続できません" }, 503);
  }
});

/**
 * GET /api/chat/file-content?path=xxx
 * ファイル内容をブリッジ経由で取得
 */
chatRoute.get("/file-content", async (c) => {
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path パラメータが必要です" }, 400);

  try {
    const response = await fetch(
      `${c.env.BRIDGE_URL}/file-content?path=${encodeURIComponent(path)}`,
      {
        headers: { Authorization: `Bearer ${c.env.BRIDGE_SECRET}` },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (response.ok) return c.json(await response.json());
    return c.json({ error: "ファイルの読み込みに失敗しました" }, 502);
  } catch {
    return c.json({ error: "ブリッジに接続できません" }, 503);
  }
});

/**
 * PUT /api/chat/file-content
 * ファイル内容をブリッジ経由で更新
 */
chatRoute.put("/file-content", async (c) => {
  const body = await c.req.json();

  try {
    const response = await fetch(`${c.env.BRIDGE_URL}/file-content`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.BRIDGE_SECRET}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return c.json(await response.json());
    return c.json({ error: "ファイルの保存に失敗しました" }, 502);
  } catch {
    return c.json({ error: "ブリッジに接続できません" }, 503);
  }
});

/**
 * GET /api/chat/health
 * ブリッジサーバーのヘルスチェック
 * ブリッジの GET /health を呼び出し、結果を返す
 */
chatRoute.get("/health", async (c) => {
  try {
    const bridgeUrl = `${c.env.BRIDGE_URL}/health`;
    const response = await fetch(bridgeUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${c.env.BRIDGE_SECRET}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      const data = await response.json();
      return c.json({ status: "online", ...data as Record<string, unknown> });
    }

    // 1回目失敗時、リトライする
    const retry = await fetch(bridgeUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${c.env.BRIDGE_SECRET}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (retry.ok) {
      const data = await retry.json();
      return c.json({ status: "online", ...data as Record<string, unknown> });
    }

    return c.json({ status: "offline" }, 503);
  } catch {
    // 1回目の例外時もリトライ
    try {
      const bridgeUrl = `${c.env.BRIDGE_URL}/health`;
      const retry = await fetch(bridgeUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${c.env.BRIDGE_SECRET}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (retry.ok) {
        const data = await retry.json();
        return c.json({ status: "online", ...data as Record<string, unknown> });
      }
    } catch {
      // リトライも失敗
    }
    return c.json({ status: "offline" }, 503);
  }
});
