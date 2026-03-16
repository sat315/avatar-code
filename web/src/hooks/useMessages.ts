import { useState, useRef, useCallback } from "react";
import type { Message, MessageUsage } from "../types/chat";
import { API_BASE, authHeaders, authHeadersNoBody } from "../config";

/** ページネーションサイズ */
const PAGE_SIZE = 50;

/** APIから返されるメッセージの型 */
interface ApiMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  image_url?: string | null;
  usage_json?: string | null;
  generated_images_json?: string | null;
}

/** APIメッセージをフロント用Messageに変換 */
function mapApiMessage(m: ApiMessage): Message {
  return {
    id: m.id,
    role: m.role === "assistant" ? "ai" : "user",
    content: m.content,
    imageUrl: m.image_url || undefined,
    ...(m.role === "assistant" && m.usage_json
      ? { usage: JSON.parse(m.usage_json) as MessageUsage }
      : {}),
    generatedImages: m.generated_images_json
      ? JSON.parse(m.generated_images_json) as string[]
      : [],
  };
}

/**
 * メッセージ管理カスタムフック
 * 取得・追加・更新・ページネーション・巻き戻しを一括管理
 */
export function useMessages(personaIdRef: React.RefObject<string | null>) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  /** ページネーション中のスクロール防止フラグ */
  const isLoadingOlderRef = useRef(false);

  /**
   * セッションのメッセージ読み込み（フォルダ選択時の初回ロード用）
   * @returns activeSessionId（見つからなければnull）
   */
  const loadSessionMessages = useCallback(
    async (folderId: string): Promise<string | null> => {
      try {
        // セッション一覧を取得
        const sessionsRes = await fetch(
          `${API_BASE}/sessions/${folderId}`,
          { headers: authHeadersNoBody() }
        );
        if (!sessionsRes.ok) return null;

        const sessionsData = (await sessionsRes.json()) as {
          sessions: Array<{ id: string; is_active: number }>;
        };

        const activeSession = sessionsData.sessions.find(
          (s) => s.is_active === 1
        );
        if (!activeSession) return null;

        // アクティブセッションのメッセージを取得
        const msgsRes = await fetch(
          `${API_BASE}/messages/session/${activeSession.id}?limit=${PAGE_SIZE}`,
          { headers: authHeadersNoBody() }
        );
        if (!msgsRes.ok) return activeSession.id;

        const msgsData = (await msgsRes.json()) as {
          messages: ApiMessage[];
        };

        setMessages(msgsData.messages.map(mapApiMessage));
        setHasMore(msgsData.messages.length >= PAGE_SIZE);

        return activeSession.id;
      } catch (e) {
        console.warn("セッション履歴取得失敗:", e);
        return null;
      }
    },
    []
  );

  /** ペルソナ全体の会話履歴を読み込む（フォルダなし時） */
  const loadPersonaMessages = useCallback(async () => {
    const personaId = personaIdRef.current;
    if (!personaId) return;

    try {
      const res = await fetch(
        `${API_BASE}/messages/${personaId}?limit=${PAGE_SIZE}`,
        { headers: authHeadersNoBody() }
      );
      if (!res.ok) return;

      const data = (await res.json()) as { messages: ApiMessage[] };
      setMessages(data.messages.map(mapApiMessage));
      setHasMore(data.messages.length >= PAGE_SIZE);
    } catch (e) {
      console.warn("メッセージ取得失敗:", e);
    }
  }, [personaIdRef]);

  /**
   * 古いメッセージを追加読み込み（ページネーション）
   * スクロール位置を維持するためmainRefを受け取る
   */
  const loadOlderMessages = useCallback(
    async (
      activeSessionId: string | null,
      mainRef: React.RefObject<HTMLElement | null>
    ) => {
      const personaId = personaIdRef.current;
      if (!personaId || loadingOlder || !hasMore) return;

      setLoadingOlder(true);
      isLoadingOlderRef.current = true;
      const mainEl = mainRef.current;
      const prevScrollHeight = mainEl?.scrollHeight || 0;

      try {
        // separatorを除いた実メッセージ数でoffset計算
        const currentLen = messages.filter((m) => !m.isSeparator).length;
        const url = activeSessionId
          ? `${API_BASE}/messages/session/${activeSessionId}?limit=${PAGE_SIZE}&offset=${currentLen}`
          : `${API_BASE}/messages/${personaId}?limit=${PAGE_SIZE}&offset=${currentLen}`;
        const res = await fetch(url, { headers: authHeadersNoBody() });
        if (!res.ok) return;

        const data = (await res.json()) as { messages: ApiMessage[] };

        if (data.messages.length === 0) {
          setHasMore(false);
          return;
        }

        const older = data.messages.map(mapApiMessage);

        setMessages((prev) => [...older, ...prev]);
        setHasMore(data.messages.length >= PAGE_SIZE);

        // スクロール位置を維持（prepend後にずれないように）
        requestAnimationFrame(() => {
          if (mainEl) {
            mainEl.scrollTop = mainEl.scrollHeight - prevScrollHeight;
          }
          isLoadingOlderRef.current = false;
        });
      } catch (e) {
        console.warn("古いメッセージ取得失敗:", e);
        isLoadingOlderRef.current = false;
      } finally {
        setLoadingOlder(false);
      }
    },
    [personaIdRef, loadingOlder, hasMore, messages]
  );

  /** メッセージを1件追加 */
  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  /** 最後のAIメッセージを更新（ストリーミング用） */
  const updateLastAi = useCallback(
    (updater: (msg: Message) => Message) => {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "ai") {
          updated[updated.length - 1] = updater(last);
        }
        return updated;
      });
    },
    []
  );

  /** メッセージをクリア（hasMoreはfalseにして切り替え中の誤発火を防ぐ） */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setHasMore(false);
  }, []);

  /**
   * 指定メッセージ以降を巻き戻し（API呼び出し + state更新）
   * ※ APIエンドポイントは後で作成予定
   */
  const rewindAfter = useCallback(
    async (messageId: number, sessionId: string | null) => {
      try {
        const query = sessionId ? `?session_id=${sessionId}` : "";
        const res = await fetch(
          `${API_BASE}/messages/after/${messageId}${query}`,
          {
            method: "DELETE",
            headers: authHeaders(),
          }
        );
        if (!res.ok) {
          console.warn("巻き戻しAPI失敗:", res.status);
          return;
        }

        // 該当メッセージ以降をstateから除去
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx === -1) return prev;
          return prev.slice(0, idx + 1);
        });
      } catch (e) {
        console.warn("巻き戻し失敗:", e);
      }
    },
    []
  );

  return {
    messages,
    setMessages,
    loadingOlder,
    hasMore,
    setHasMore,
    isLoadingOlderRef,
    loadSessionMessages,
    loadPersonaMessages,
    loadOlderMessages,
    addMessage,
    updateLastAi,
    clearMessages,
    rewindAfter,
  };
}
