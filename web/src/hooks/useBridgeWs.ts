import { useState, useRef, useCallback, useEffect } from "react";

// ---- 送信メッセージ型 ----
type ClientMessage =
  | {
      type: "start";
      model?: string;
      permissionMode?: string;
      systemPrompt?: string;
      personaId?: string;
      initialPrompt?: string;
      image?: string;
      cwd?: string;
      /** WS再接続時にAgent SDKセッションを復元するためのセッションID */
      resumeSessionId?: string;
    }
  | { type: "input"; text: string; image?: string }
  | { type: "approve"; toolUseId: string }
  | { type: "reject"; toolUseId: string; reason?: string }
  | { type: "interrupt" }
  | { type: "get_diff"; cwd?: string };

// ---- 受信メッセージ型 ----
type ServerMessage =
  | { type: "status"; status: string }
  | { type: "system"; subtype: string; sessionId: string; tools?: string[] }
  | {
      type: "assistant";
      message: { type: string; id?: string; name?: string; input?: unknown };
    }
  | { type: "stream_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | {
      type: "permission_request";
      toolUseId: string;
      toolName: string;
      input: unknown;
    }
  | { type: "tool_result"; toolUseId: string; result: unknown }
  | {
      type: "result";
      result: string;
      durationMs: number;
      numTurns: number;
      totalCostUsd: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    }
  | { type: "error"; message: string }
  | { type: "diff_result"; diff: string; error: string | null };

// ---- 接続状態 ----
type ConnectionStatus = "connecting" | "connected" | "disconnected";

// ---- フックのオプション ----
export interface UseBridgeWsOptions {
  onStreamDelta?: (text: string) => void;
  onThinkingDelta?: (text: string) => void;
  onResult?: (
    result: string,
    durationMs: number,
    usage: {
      totalCostUsd: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      numTurns: number;
    }
  ) => void;
  onPermissionRequest?: (
    toolUseId: string,
    toolName: string,
    input: unknown
  ) => void;
  onToolResult?: (toolUseId: string, result: unknown) => void;
  onAssistant?: (message: unknown) => void;
  onError?: (message: string) => void;
  onDiffResult?: (diff: string, error: string | null) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

// ---- フックの戻り値 ----
export interface UseBridgeWsReturn {
  status: ConnectionStatus;
  sessionId: string | null;
  start: (opts: {
    model?: string;
    permissionMode?: string;
    systemPrompt?: string;
    personaId?: string;
    initialPrompt?: string;
    image?: string;
    cwd?: string;
    /** WS再接続時にAgent SDKセッションを復元するためのセッションID */
    resumeSessionId?: string;
  }) => void;
  sendInput: (text: string, image?: string) => void;
  approve: (toolUseId: string) => void;
  reject: (toolUseId: string, reason?: string) => void;
  interrupt: () => void;
  getDiff: (cwd?: string) => void;
  connect: () => void;
  disconnect: () => void;
  /** WSを切断せずにセッションだけリセット（巻き戻し用） */
  resetSession: () => void;
}

/** 再接続の最大リトライ回数 */
const MAX_RETRIES = 5;
/** 再接続までの待機時間（ms） */
const RETRY_DELAY_MS = 3000;

/**
 * WebSocket URLを生成
 * 本番: ブリッジに直接接続（Cloudflare Tunnel経由）
 * 開発: ブリッジに直接接続（localhost）
 */
function buildWsUrl(): string {
  if (import.meta.env.VITE_BRIDGE_HTTP_BASE) {
    const base = import.meta.env.VITE_BRIDGE_HTTP_BASE
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://");
    return `${base}/ws`;
  }
  if (import.meta.env.PROD) {
    console.warn("VITE_BRIDGE_HTTP_BASE is not set. Please configure .env.local");
    return "";
  }
  // ローカル開発: localhost:5173 はブリッジのOrigin許可リストに含まれるため
  // トークン不要で接続できる
  return "ws://localhost:3456/ws";
}

/**
 * ブリッジサーバーへのWebSocket接続を管理するカスタムフック
 */
export function useBridgeWs(
  options: UseBridgeWsOptions = {}
): UseBridgeWsReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // コールバックを最新値で参照するためのref
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 手動切断フラグ（手動切断時は再接続しない）
  const manualDisconnectRef = useRef(false);

  /** 接続状態を更新し、コールバックも呼ぶ */
  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    optionsRef.current.onStatusChange?.(newStatus);
  }, []);

  /** WebSocketでメッセージを送信 */
  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[useBridgeWs] WebSocket未接続のため送信できません", msg);
      return;
    }
    ws.send(JSON.stringify(msg));
  }, []);

  /** サーバーからのメッセージを処理 */
  const handleMessage = useCallback((data: string) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      console.error("[useBridgeWs] JSONパース失敗:", data);
      return;
    }

    const opts = optionsRef.current;

    switch (msg.type) {
      case "system":
        setSessionId(msg.sessionId);
        break;
      case "stream_delta":
        opts.onStreamDelta?.(msg.text);
        break;
      case "thinking_delta":
        opts.onThinkingDelta?.(msg.text);
        break;
      case "result":
        opts.onResult?.(msg.result, msg.durationMs, {
          totalCostUsd: msg.totalCostUsd,
          inputTokens: msg.inputTokens,
          outputTokens: msg.outputTokens,
          cacheReadTokens: msg.cacheReadTokens,
          cacheWriteTokens: msg.cacheWriteTokens,
          numTurns: msg.numTurns,
        });
        break;
      case "permission_request":
        opts.onPermissionRequest?.(msg.toolUseId, msg.toolName, msg.input);
        break;
      case "tool_result":
        opts.onToolResult?.(msg.toolUseId, msg.result);
        break;
      case "assistant":
        opts.onAssistant?.(msg.message);
        break;
      case "error":
        opts.onError?.(msg.message);
        break;
      case "diff_result":
        opts.onDiffResult?.(msg.diff, msg.error);
        break;
      case "status":
        // ステータス通知（ログのみ）
        break;
      default:
        console.warn("[useBridgeWs] 未知のメッセージタイプ:", msg);
    }
  }, []);

  /** WebSocket接続を開始 */
  const connect = useCallback(() => {
    // 既に接続中 or 接続済みなら何もしない
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    manualDisconnectRef.current = false;
    updateStatus("connecting");

    const url = buildWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      retryCountRef.current = 0;
      updateStatus("connected");
    });

    ws.addEventListener("message", (event) => {
      handleMessage(event.data as string);
    });

    ws.addEventListener("close", () => {
      wsRef.current = null;
      // WS切断 = Agent SDKセッションも終了
      setSessionId(null);
      updateStatus("disconnected");

      // 手動切断でなければ自動再接続を試みる
      if (
        !manualDisconnectRef.current &&
        retryCountRef.current < MAX_RETRIES
      ) {
        retryCountRef.current += 1;
        console.info(
          `[useBridgeWs] ${RETRY_DELAY_MS}ms後に再接続します（${retryCountRef.current}/${MAX_RETRIES}）`
        );
        retryTimerRef.current = setTimeout(() => {
          connect();
        }, RETRY_DELAY_MS);
      }
    });

    ws.addEventListener("error", (event) => {
      console.error("[useBridgeWs] WebSocketエラー:", event);
      // errorの後にcloseが発火するので、再接続はclose側で処理
    });
  }, [updateStatus, handleMessage]);

  /** WSを切断せずにセッションだけリセット（巻き戻し用） */
  const resetSession = useCallback(() => {
    setSessionId(null);
  }, []);

  /** WebSocket接続を切断 */
  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;

    // 再接続タイマーをクリア
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    retryCountRef.current = 0;
    setSessionId(null);
    updateStatus("disconnected");
  }, [updateStatus]);

  // アンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      manualDisconnectRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // ---- 送信ヘルパー ----

  const start = useCallback(
    (opts: {
      model?: string;
      permissionMode?: string;
      systemPrompt?: string;
      personaId?: string;
      initialPrompt?: string;
      image?: string;
      cwd?: string;
      /** WS再接続時にAgent SDKセッションを復元するためのセッションID */
      resumeSessionId?: string;
    }) => {
      send({ type: "start", ...opts });
    },
    [send]
  );

  const sendInput = useCallback(
    (text: string, image?: string) => {
      send({ type: "input", text, ...(image ? { image } : {}) });
    },
    [send]
  );

  const approve = useCallback(
    (toolUseId: string) => {
      send({ type: "approve", toolUseId });
    },
    [send]
  );

  const reject = useCallback(
    (toolUseId: string, reason?: string) => {
      send({ type: "reject", toolUseId, ...(reason ? { reason } : {}) });
    },
    [send]
  );

  const interrupt = useCallback(() => {
    send({ type: "interrupt" });
  }, [send]);

  // git diff取得リクエスト送信
  const getDiff = useCallback(
    (cwd?: string) => {
      send({ type: "get_diff", ...(cwd ? { cwd } : {}) });
    },
    [send]
  );

  return {
    status,
    sessionId,
    start,
    sendInput,
    approve,
    reject,
    interrupt,
    getDiff,
    connect,
    disconnect,
    resetSession,
  };
}
