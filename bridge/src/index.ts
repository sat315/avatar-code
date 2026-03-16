/**
 * AvatarCode Bridge Server
 *
 * Agent SDK + WebSocket で Claude Code と通信するブリッジサーバー
 * HTTP: /health, /deploy
 * WebSocket: /ws（Claude Codeセッション管理）
 */
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname, extname } from "node:path";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKUserMessage,
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";

// Claude Code内からのネスト起動を許可
delete process.env.CLAUDECODE;

// ---------- 型定義: WebSocketメッセージプロトコル ----------

/** クライアント → ブリッジ */
type ClientMessage =
  | { type: "start"; model?: string; permissionMode?: string; systemPrompt?: string; personaId?: string; initialPrompt?: string; image?: string; cwd?: string; resumeSessionId?: string }
  | { type: "input"; text: string; image?: string }
  | { type: "approve"; toolUseId: string }
  | { type: "reject"; toolUseId: string; reason?: string }
  | { type: "interrupt" }
  | { type: "get_diff"; cwd?: string };

/** ブリッジ → クライアント */
type ServerMessage =
  | { type: "system"; subtype: string; sessionId: string; tools?: string[] }
  | { type: "assistant"; message: unknown }
  | { type: "stream_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "permission_request"; toolUseId: string; toolName: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; result: unknown }
  | { type: "result"; result: string; durationMs: number; numTurns: number; totalCostUsd: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  | { type: "error"; message: string }
  | { type: "status"; status: string }
  | { type: "diff_result"; diff: string; error: string | null };

// ---------- 設定 ----------

const PORT = Number(process.env.PORT) || 3456;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;
const BRIDGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_BASE_DIR = process.env.PROJECTS_DIR
  ? resolve(process.env.PROJECTS_DIR)
  : resolve(BRIDGE_DIR, "..", "..");  // fallback: bridgeの2階層上
const PERSONAS_DIR = resolve(BRIDGE_DIR, "personas");
const execAsync = promisify(exec);

// ---------- セッション管理 ----------

interface Session {
  /** ユーザーメッセージの待ち行列 */
  pendingInputQueue: SDKUserMessage[];
  /** 次のユーザー入力を待つためのresolve */
  userMessageResolve: ((msg: SDKUserMessage) => void) | null;
  /** ツール承認待ちのPromise（toolUseId → resolve） */
  pendingPermissions: Map<string, { resolve: (result: PermissionResult) => void }>;
  /** セッション停止フラグ */
  stopped: boolean;
  /** AbortController（中断用） */
  abortController: AbortController;
  /** Agent SDKのセッションID */
  sessionId: string | null;
}

/** アクティブセッション（WebSocketコネクションごとに1つ） */
const sessions = new Map<WebSocket, Session>();

// ---------- ペルソナ解決 ----------

function resolveSystemPrompt(
  systemPrompt: string | undefined,
  personaId: string | undefined
): string | undefined {
  if (personaId) {
    try {
      // パストラバーサル防止: 解決後のパスがPERSONAS_DIR内か検証
      const filePath = resolve(PERSONAS_DIR, `${personaId}.md`);
      if (!filePath.startsWith(PERSONAS_DIR)) {
        console.warn(`[Persona] Path traversal blocked: "${personaId}"`);
        return systemPrompt;
      }
      const content = readFileSync(filePath, "utf-8");
      console.log(`[Persona] Loaded: ${filePath}`);
      return content;
    } catch {
      console.log(`[Persona] No file for "${personaId}", using request systemPrompt`);
    }
  }
  return systemPrompt;
}

// ---------- WebSocket送信ヘルパー ----------

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ---------- AsyncGeneratorパターン: ユーザー入力の供給 ----------

async function* createUserMessageStream(session: Session): AsyncGenerator<SDKUserMessage> {
  while (!session.stopped) {
    // キューにメッセージがあればすぐyield
    if (session.pendingInputQueue.length > 0) {
      yield session.pendingInputQueue.shift()!;
      continue;
    }
    // 次のユーザー入力をPromiseで待機
    const msg = await new Promise<SDKUserMessage>((resolve) => {
      session.userMessageResolve = resolve;
    });
    session.userMessageResolve = null;
    yield msg;
  }
}

// ---------- セッション開始 ----------

async function startSession(
  ws: WebSocket,
  msg: Extract<ClientMessage, { type: "start" }>
) {
  const session: Session = {
    pendingInputQueue: [],
    userMessageResolve: null,
    pendingPermissions: new Map(),
    stopped: false,
    abortController: new AbortController(),
    sessionId: null,
  };
  sessions.set(ws, session);

  const systemPrompt = resolveSystemPrompt(msg.systemPrompt, msg.personaId);
  const model = msg.model || "claude-sonnet-4-6";
  const permissionMode = (msg.permissionMode || "default") as
    "default" | "acceptEdits" | "bypassPermissions" | "plan";

  // 作業ディレクトリの解決（PROJECTS_DIR内のみ許可）
  let cwd = BRIDGE_DIR;
  if (msg.cwd) {
    const resolved = resolve(ALLOWED_BASE_DIR, msg.cwd);
    if (resolved.startsWith(ALLOWED_BASE_DIR)) {
      cwd = resolved;
      console.log(`[Session] cwd: ${cwd}`);
    } else {
      console.warn(`[Session] Invalid cwd rejected: ${msg.cwd}`);
    }
  }

  const resumeSessionId = msg.resumeSessionId || undefined;
  console.log(`[Session] Starting: model=${model}, permissionMode=${permissionMode}${resumeSessionId ? `, resume=${resumeSessionId}` : ""}`);

  // 初回プロンプトがあればキューに積む（AsyncGeneratorがすぐyieldできるように）
  if (msg.initialPrompt || msg.image) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let initialContent: any = msg.initialPrompt || "";
    if (msg.image) {
      const matches = msg.image.match(/^data:([^;]+);base64,(.+)$/s);
      const blocks: Array<Record<string, unknown>> = [];
      if (matches) {
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: matches[1], data: matches[2] },
        });
      }
      if (msg.initialPrompt) {
        blocks.push({ type: "text", text: msg.initialPrompt });
      }
      if (blocks.length > 0) initialContent = blocks;
    }
    session.pendingInputQueue.push({
      type: "user",
      message: { role: "user", content: initialContent },
      parent_tool_use_id: null,
      session_id: "",
    });
  }

  // canUseToolコールバック: ツール承認をWebSocket経由でクライアントに中継
  const canUseTool: CanUseTool = async (toolName, input, _options) => {
    // ツールIDを生成（input内のtool_use_idがあればそれを使う）
    const toolUseId = (input as Record<string, unknown>).id as string || `tool_${Date.now()}`;

    console.log(`[Session] Permission request: ${toolName}`);
    send(ws, {
      type: "permission_request",
      toolUseId,
      toolName,
      input,
    });

    // クライアントからのapprove/rejectを待機
    return new Promise<PermissionResult>((resolve) => {
      session.pendingPermissions.set(toolUseId, { resolve });
    });
  };

  try {
    const conversation = query({
      prompt: createUserMessageStream(session),
      options: {
        cwd,
        model,
        permissionMode,
        ...(permissionMode !== "bypassPermissions" && { canUseTool }),
        ...(systemPrompt && { systemPrompt }),
        // WS再接続時にAgent SDKセッションを復元
        ...(resumeSessionId && { resume: resumeSessionId }),
      },
    });

    // メッセージループ
    for await (const sdkMessage of conversation) {
      if (session.stopped) break;

      // SDKメッセージをクライアントに転送
      switch (sdkMessage.type) {
        case "system":
          session.sessionId = (sdkMessage as { session_id?: string }).session_id || null;
          send(ws, {
            type: "system",
            subtype: (sdkMessage as { subtype?: string }).subtype || "init",
            sessionId: session.sessionId || "",
            tools: (sdkMessage as { tools?: string[] }).tools,
          });
          break;

        case "assistant": {
          const assistantMsg = sdkMessage as { message?: unknown };
          // thinkingとtextを分離して送信
          const message = assistantMsg.message as {
            content?: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; input?: unknown }>;
          };
          if (message?.content) {
            for (const block of message.content) {
              if (block.type === "thinking" && block.thinking) {
                send(ws, { type: "thinking_delta", text: block.thinking });
              } else if (block.type === "text" && block.text) {
                send(ws, { type: "stream_delta", text: block.text });
              } else if (block.type === "tool_use") {
                send(ws, {
                  type: "assistant",
                  message: { type: "tool_use", id: block.id, name: block.name, input: block.input },
                });
              }
            }
          }
          break;
        }

        case "user": {
          // ツール実行結果
          const userMsg = sdkMessage as { message?: { content?: Array<{ tool_use_id?: string; content?: unknown }> } };
          if (userMsg.message?.content) {
            for (const block of userMsg.message.content) {
              if (block.tool_use_id) {
                send(ws, {
                  type: "tool_result",
                  toolUseId: block.tool_use_id,
                  result: block.content,
                });
              }
            }
          }
          break;
        }

        case "result": {
          const resultMsg = sdkMessage as {
            result?: string;
            duration_ms?: number;
            num_turns?: number;
            total_cost_usd?: number;
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            };
          };
          const usage = resultMsg.usage;
          console.log("[Session] result message:", JSON.stringify({ total_cost_usd: resultMsg.total_cost_usd, duration_ms: resultMsg.duration_ms, usage }));
          send(ws, {
            type: "result",
            result: resultMsg.result || "",
            durationMs: resultMsg.duration_ms || 0,
            numTurns: resultMsg.num_turns || 0,
            totalCostUsd: resultMsg.total_cost_usd || 0,
            inputTokens: usage?.input_tokens || 0,
            outputTokens: usage?.output_tokens || 0,
            cacheReadTokens: usage?.cache_read_input_tokens || 0,
            cacheWriteTokens: usage?.cache_creation_input_tokens || 0,
          });
          break;
        }

        default:
          // その他のメッセージ（rate_limit_event等）はログのみ
          console.log(`[Session] SDK message: type=${sdkMessage.type}`);
          break;
      }
    }

    console.log("[Session] Conversation ended");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Session] Error:", errorMessage);
    send(ws, { type: "error", message: errorMessage });
  } finally {
    sessions.delete(ws);
  }
}

// ---------- クライアントメッセージ処理 ----------

async function handleClientMessage(ws: WebSocket, raw: string) {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  const session = sessions.get(ws);

  switch (msg.type) {
    case "start":
      if (session) {
        send(ws, { type: "error", message: "Session already active" });
        return;
      }
      // セッション開始（非同期、バックグラウンドで実行）
      startSession(ws, msg).catch((err) => {
        console.error("[Session] Unhandled error:", err);
      });
      break;

    case "input": {
      if (!session) {
        send(ws, { type: "error", message: "No active session" });
        return;
      }
      // Build content: string (text only) or multimodal array (image + text)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let inputContent: any = msg.text;
      if (msg.image) {
        const matches = msg.image.match(/^data:([^;]+);base64,(.+)$/s);
        const blocks: Array<Record<string, unknown>> = [];
        if (matches) {
          const imageSizeKB = Math.round(matches[2].length * 0.75 / 1024);
          console.log(`[input] 画像受信: media_type=${matches[1]}, size≈${imageSizeKB}KB`);
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: matches[1], data: matches[2] },
          });
        } else {
          console.warn("[input] 画像データURIのパース失敗:", msg.image.slice(0, 50));
        }
        if (msg.text) {
          blocks.push({ type: "text", text: msg.text });
        } else {
          // 画像のみ送信時: Agent SDKがテキストブロック必須の場合のフォールバック
          blocks.push({ type: "text", text: "（画像を送信しました）" });
        }
        if (blocks.length > 0) inputContent = blocks;
      }
      const userMessage: SDKUserMessage = {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: inputContent,
        },
        parent_tool_use_id: null,
        session_id: session.sessionId || "",
      };
      // 待機中のresolveがあればすぐ供給、なければキューに積む
      if (session.userMessageResolve) {
        session.userMessageResolve(userMessage);
      } else {
        session.pendingInputQueue.push(userMessage);
      }
      break;
    }

    case "approve": {
      if (!session) return;
      const pending = session.pendingPermissions.get(msg.toolUseId);
      if (pending) {
        pending.resolve({ behavior: "allow" });
        session.pendingPermissions.delete(msg.toolUseId);
        console.log(`[Session] Tool approved: ${msg.toolUseId}`);
      }
      break;
    }

    case "reject": {
      if (!session) return;
      const pending = session.pendingPermissions.get(msg.toolUseId);
      if (pending) {
        pending.resolve({ behavior: "deny", message: msg.reason || "User denied" });
        session.pendingPermissions.delete(msg.toolUseId);
        console.log(`[Session] Tool rejected: ${msg.toolUseId}`);
      }
      break;
    }

    case "interrupt": {
      if (!session) return;
      session.stopped = true;
      session.abortController.abort();
      // 待機中のresolveを解放
      if (session.userMessageResolve) {
        session.userMessageResolve({
          type: "user",
          message: { role: "user", content: "" },
          parent_tool_use_id: null,
          session_id: "",
        });
      }
      console.log("[Session] Interrupted");
      break;
    }

    case "get_diff": {
      // セッション不要: git diffをcwd指定で取得
      let diffCwd = ALLOWED_BASE_DIR;
      if (msg.cwd) {
        const resolved = resolve(ALLOWED_BASE_DIR, msg.cwd);
        if (resolved.startsWith(ALLOWED_BASE_DIR)) {
          diffCwd = resolved;
        } else {
          send(ws, { type: "diff_result", diff: "", error: "無効なパスです" });
          return;
        }
      }

      try {
        const [unstaged, staged] = await Promise.all([
          execAsync("git diff", { cwd: diffCwd, timeout: 10_000 }).catch(() => ({ stdout: "" })),
          execAsync("git diff --staged", { cwd: diffCwd, timeout: 10_000 }).catch(() => ({ stdout: "" })),
        ]);
        const combined = [unstaged.stdout, staged.stdout].filter(Boolean).join("\n");
        send(ws, { type: "diff_result", diff: combined, error: null });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "diff取得に失敗しました";
        send(ws, { type: "diff_result", diff: "", error: errorMessage });
      }
      break;
    }

    default:
      send(ws, { type: "error", message: `Unknown message type: ${(msg as { type: string }).type}` });
  }
}

// ---------- Hono HTTPアプリ ----------

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      // 環境変数 WORKER_URL が設定されていればそれも許可
      const workerUrl = process.env.WORKER_URL;
      const allowed = ["http://localhost:8787", workerUrl].filter(Boolean) as string[];
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// ヘルスチェック（認証不要）
app.get("/health", (c) => {
  return c.json({
    status: "online",
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size,
  });
});

// 認証ミドルウェア（/health以外）
app.use("*", async (c, next) => {
  if (!BRIDGE_SECRET) return next();
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== BRIDGE_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

// プロジェクト一覧（PROJECTS_DIR内のディレクトリをスキャン）
app.get("/projects", (c) => {
  try {
    const entries = readdirSync(ALLOWED_BASE_DIR, { withFileTypes: true });
    const projects = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => e.name)
      .sort();
    return c.json({ projects });
  } catch (err) {
    console.error("[Projects] Error:", err);
    return c.json({ error: "プロジェクト一覧の取得に失敗しました" }, 500);
  }
});

// ファイルエントリの型
interface FileEntry {
  name: string;
  path: string; // ALLOWED_BASE_DIR からの相対パス（例: "my-project/README.md"）
  type: "file" | "dir";
  children?: FileEntry[];
}

// ディレクトリを再帰スキャンしてファイルツリーを返す
function listFilesRecursive(
  dirPath: string,
  extensions: string[],
  baseDir: string
): FileEntry[] {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = resolve(dirPath, entry.name);
      // ALLOWED_BASE_DIR からの相対パス（セパレーターを / に統一）
      const relPath = fullPath.slice(baseDir.length + 1).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        const children = listFilesRecursive(fullPath, extensions, baseDir);
        // 対象ファイルが1つでもあるディレクトリだけ含める
        if (children.length > 0) {
          result.push({ name: entry.name, path: relPath, type: "dir", children });
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (extensions.length === 0 || extensions.includes(ext)) {
          result.push({ name: entry.name, path: relPath, type: "file" });
        }
      }
    }

    // ディレクトリ優先 → ファイル名アルファベット順
    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

// ファイルツリー取得（フォルダ内の .md / .txt など）
app.get("/files", (c) => {
  const folderPath = c.req.query("path");
  const extensionsParam = c.req.query("extensions") ?? ".md,.txt,.json,.yaml,.yml,.toml";
  const extensions = extensionsParam
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!folderPath) return c.json({ error: "path パラメータが必要です" }, 400);

  const resolved = resolve(ALLOWED_BASE_DIR, folderPath);
  if (!resolved.startsWith(ALLOWED_BASE_DIR)) {
    return c.json({ error: "不正なパスです" }, 403);
  }

  try {
    const files = listFilesRecursive(resolved, extensions, ALLOWED_BASE_DIR);
    return c.json({ files });
  } catch (err) {
    console.error("[Files] Error:", err);
    return c.json({ error: "ファイル一覧の取得に失敗しました" }, 500);
  }
});

// ファイル内容取得
app.get("/file-content", (c) => {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "path パラメータが必要です" }, 400);

  const resolved = resolve(ALLOWED_BASE_DIR, filePath);
  if (!resolved.startsWith(ALLOWED_BASE_DIR)) {
    return c.json({ error: "不正なパスです" }, 403);
  }

  try {
    const content = readFileSync(resolved, "utf-8");
    return c.json({ content });
  } catch (err) {
    console.error("[FileContent] Error:", err);
    return c.json({ error: "ファイルの読み込みに失敗しました" }, 500);
  }
});

// ファイル内容更新
app.put("/file-content", async (c) => {
  const body = await c.req.json<{ path?: string; content?: string }>();
  const filePath = body.path;
  const content = body.content;

  if (!filePath) return c.json({ error: "path が必要です" }, 400);
  if (content === undefined || content === null) return c.json({ error: "content が必要です" }, 400);

  // パス検証
  const resolved = resolve(ALLOWED_BASE_DIR, filePath);
  if (!resolved.startsWith(ALLOWED_BASE_DIR)) {
    return c.json({ error: "不正なパスです" }, 403);
  }

  // 拡張子チェック
  const allowedExtensions = [".md", ".txt", ".json", ".yaml", ".yml", ".toml"];
  const ext = extname(resolved).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return c.json({ error: "許可されていない拡張子です" }, 400);
  }

  // 既存ファイルのみ編集可能（新規作成は不可）
  try {
    if (!statSync(resolved).isFile()) {
      return c.json({ error: "パスはファイルではありません" }, 400);
    }
  } catch {
    return c.json({ error: "ファイルが存在しません" }, 404);
  }

  try {
    writeFileSync(resolved, content, "utf-8");
    return c.json({ ok: true });
  } catch (err) {
    console.error("[FileContent] Write error:", err);
    return c.json({ error: "ファイルの書き込みに失敗しました" }, 500);
  }
});

// デプロイ
app.post("/deploy", async (c) => {
  const projectRoot = resolve(BRIDGE_DIR, "..");
  try {
    // 未コミット変更の確認（stashで退避、データ損失を防ぐ）
    const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd: projectRoot, timeout: 10_000 });
    let stashed = false;
    if (statusOut.trim()) {
      await execAsync('git stash push -m "auto-stash before deploy"', { cwd: projectRoot, timeout: 10_000 });
      stashed = true;
      console.log("[Deploy] Stashed local changes");
    }
    const { stdout, stderr } = await execAsync("git pull", { cwd: projectRoot, timeout: 30_000 });
    console.log(`[Deploy] git pull stdout: ${stdout}`);
    if (stderr) console.log(`[Deploy] git pull stderr: ${stderr}`);

    // PM2のwatchがファイル変更を検知して自動再起動する
    return c.json({
      status: "ok",
      message: `git pull完了${stashed ? "（ローカル変更はstashに退避済み）" : ""}。PM2が変更を検知して自動再起動します。`,
      output: stdout.trim(),
      stashed,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Deploy] Error:", errorMessage);
    return c.json({ status: "error", message: errorMessage }, 500);
  }
});

// ---------- サーバー起動 ----------

if (!BRIDGE_SECRET) {
  console.warn("⚠️  BRIDGE_SECRET が未設定です。本番環境では必ず設定してください。");
}

if (!process.env.PROJECTS_DIR) {
  console.warn(`⚠️  PROJECTS_DIR が未設定です。フォールバックとして "${ALLOWED_BASE_DIR}" を使用します。`);
  console.warn("   bridge/.env の PROJECTS_DIR にプロジェクトフォルダのパスを設定することを推奨します。");
}

console.log(`AvatarCode Bridge Server starting on port ${PORT}...`);
console.log(`Projects directory: ${ALLOWED_BASE_DIR}`);

const server = serve(
  { fetch: app.fetch, port: PORT },
  (info) => {
    console.log(`AvatarCode Bridge Server is running on http://localhost:${info.port}`);
    console.log(`WebSocket: ws://localhost:${info.port}/ws`);
    if (BRIDGE_SECRET) {
      console.log("Authentication: enabled");
    } else {
      console.log("Authentication: disabled");
    }
  }
);

// ---------- WebSocketサーバー ----------

const wss = new WebSocketServer({ noServer: true });

// HTTPサーバーのupgradeイベントでWebSocket接続を処理
(server as ReturnType<typeof serve>).on("upgrade", (req: IncomingMessage, socket: unknown, head: Buffer) => {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);

  // /ws パスのみWebSocket接続を受け付ける
  if (url.pathname !== "/ws") {
    (socket as import("net").Socket).destroy();
    return;
  }

  // 認証チェック: トークン認証 or 許可されたOriginからの接続
  const authParam = url.searchParams.get("token");
  const origin = req.headers.origin || "";
  const frontendUrl = process.env.FRONTEND_URL;
  const allowedOrigins = [
    "http://localhost:5173",
    ...(frontendUrl ? [frontendUrl] : []),
  ];
  const isTokenValid = BRIDGE_SECRET && authParam === BRIDGE_SECRET;
  const isOriginValid = allowedOrigins.includes(origin);

  if (!isTokenValid && !isOriginValid) {
    (socket as import("net").Socket).destroy();
    console.log(`[WS] Rejected: token=${!!authParam}, origin=${origin}`);
    return;
  }

  wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws: WebSocket) => {
  console.log("[WS] Client connected");

  // ハートビート: 30秒間隔でpingを送信（Cloudflare Tunnelのアイドル切断防止）
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30_000);

  ws.on("message", (data) => {
    handleClientMessage(ws, data.toString());
  });

  ws.on("close", () => {
    console.log("[WS] Client disconnected");
    clearInterval(heartbeat);
    const session = sessions.get(ws);
    if (session) {
      session.stopped = true;
      session.abortController.abort();
      // 未応答のツール承認を全てdenyで解放（Promiseリーク防止）
      for (const [toolUseId, pending] of session.pendingPermissions) {
        pending.resolve({ behavior: "deny", message: "Client disconnected" });
        console.log(`[Session] Auto-denied on disconnect: ${toolUseId}`);
      }
      session.pendingPermissions.clear();
      // 待機中のuserMessageResolveも解放
      if (session.userMessageResolve) {
        session.userMessageResolve({
          type: "user",
          message: { role: "user", content: "" },
          parent_tool_use_id: null,
          session_id: "",
        });
      }
      sessions.delete(ws);
    }
  });

  ws.on("error", (err) => {
    console.error("[WS] Error:", err.message);
    clearInterval(heartbeat);
  });

  // 接続確認
  send(ws, { type: "status", status: "connected" });
});
