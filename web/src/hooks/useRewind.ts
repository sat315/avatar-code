import { useState, useRef, useCallback } from "react";
import type { Message } from "../types/chat";

/** useRewindの依存オブジェクト */
interface UseRewindDeps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  interrupt: () => void;
  resetSession: () => void;
  rewindAfter: (messageId: number, sessionId: string | null) => Promise<void>;
  activeSessionIdRef: React.RefObject<string | null>;
  lastAgentSessionIdRef: React.MutableRefObject<string | null>;
  setStreaming: (v: boolean) => void;
}

/** 巻き戻し確認ダイアログ用スナップショット */
interface RewindTarget {
  message: Message;
  deleteCount: number;
}

/**
 * 会話巻き戻しフック
 * 指定メッセージ以降を削除してセッションをリセットする
 */
export function useRewind(deps: UseRewindDeps) {
  const {
    messages,
    interrupt,
    resetSession,
    rewindAfter,
    activeSessionIdRef,
    lastAgentSessionIdRef,
    setStreaming,
  } = deps;

  const [rewindTarget, setRewindTarget] = useState<RewindTarget | null>(null);

  /** 巻き戻し中ガードフラグ（onResultでの保存スキップ用） */
  const isRewindingRef = useRef(false);

  /** 確認ダイアログを表示する */
  const openRewind = useCallback(
    (message: Message) => {
      if (message.id == null) return;

      // 指定メッセージ以降の件数を計算（separator を除く）
      const idx = messages.findIndex((m) => m.id === message.id);
      if (idx === -1) return;

      const deleteCount = messages
        .slice(idx + 1)
        .filter((m) => !m.isSeparator).length;

      setRewindTarget({ message, deleteCount });
    },
    [messages],
  );

  /** 巻き戻しを実行する */
  const executeRewind = useCallback(async () => {
    if (!rewindTarget || rewindTarget.message.id == null) return;

    try {
      // ガードフラグを立てる
      isRewindingRef.current = true;

      // アクティブセッションがあれば停止
      interrupt();

      // ストリーミング状態をリセット
      setStreaming(false);

      // API呼び出し + state更新
      await rewindAfter(
        rewindTarget.message.id,
        activeSessionIdRef.current,
      );

      // セッションリセット
      resetSession();
      lastAgentSessionIdRef.current = null;
    } finally {
      // ガードフラグを解除
      isRewindingRef.current = false;
      setRewindTarget(null);
    }
  }, [
    rewindTarget,
    interrupt,
    setStreaming,
    rewindAfter,
    activeSessionIdRef,
    resetSession,
    lastAgentSessionIdRef,
  ]);

  /** 巻き戻しをキャンセル */
  const cancelRewind = useCallback(() => {
    setRewindTarget(null);
  }, []);

  return {
    rewindTarget,
    isRewindingRef,
    openRewind,
    executeRewind,
    cancelRewind,
  };
}
