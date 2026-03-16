import { useState, useCallback } from "react";
import type { Session } from "../types/chat";
import { API_BASE, authHeaders, authHeadersNoBody } from "../config";

/** セッション管理フックの戻り値 */
export interface UseSessionsReturn {
  sessions: Session[];
  /** フォルダのセッション一覧を取得 */
  fetchSessions: (folderId: string) => Promise<void>;
  /** 新しいセッションを作成（現アクティブを終了してから） */
  createSession: (folderId: string, currentSessionId: string | null) => Promise<Session | null>;
  /** セッションを再アクティブ化 */
  reactivateSession: (sessionId: string) => Promise<boolean>;
  /** セッションタイトルを更新 */
  updateTitle: (sessionId: string, title: string) => Promise<void>;
  /** セッションを削除 */
  deleteSession: (sessionId: string) => Promise<boolean>;
  /** ローカルstateをクリア */
  clearSessions: () => void;
}

/**
 * セッション管理フック
 * セッション一覧の取得・作成・再開・タイトル更新を管理
 */
export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<Session[]>([]);

  /** フォルダのセッション一覧を取得 */
  const fetchSessions = useCallback(async (folderId: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/sessions/${folderId}`,
        { headers: authHeadersNoBody() }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { sessions: Session[] };
      setSessions(data.sessions);
    } catch (e) {
      console.warn("セッション一覧取得失敗:", e);
    }
  }, []);

  /** 新しいセッションを作成（現アクティブを終了してから） */
  const createSession = useCallback(
    async (folderId: string, currentSessionId: string | null): Promise<Session | null> => {
      try {
        // 現アクティブセッションを終了
        if (currentSessionId) {
          await fetch(`${API_BASE}/sessions/${currentSessionId}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ is_active: 0 }),
          });
        }

        // 新セッション作成
        const res = await fetch(`${API_BASE}/sessions`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ folder_id: folderId }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { session: Session };

        // ローカルstate更新（先頭に追加 + 旧アクティブのis_activeを0に）
        setSessions((prev) => {
          const updated = prev.map((s) =>
            s.id === currentSessionId ? { ...s, is_active: 0 } : s
          );
          return [data.session, ...updated];
        });

        return data.session;
      } catch (e) {
        console.warn("セッション作成失敗:", e);
        return null;
      }
    },
    []
  );

  /** セッションを再アクティブ化 */
  const reactivateSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ is_active: 1 }),
      });
      if (!res.ok) return false;

      // ローカルstate更新
      setSessions((prev) =>
        prev.map((s) => ({
          ...s,
          is_active: s.id === sessionId ? 1 : 0,
        }))
      );
      return true;
    } catch (e) {
      console.warn("セッション再開失敗:", e);
      return false;
    }
  }, []);

  /** セッションタイトルを更新 */
  const updateTitle = useCallback(async (sessionId: string, title: string) => {
    try {
      await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ title }),
      });

      // ローカルstate更新
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
      );
    } catch (e) {
      console.warn("セッションタイトル更新失敗:", e);
    }
  }, []);

  /** セッションを削除 */
  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: "DELETE",
        headers: authHeadersNoBody(),
      });
      if (!res.ok) return false;

      // ローカルstate更新
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      return true;
    } catch (e) {
      console.warn("セッション削除失敗:", e);
      return false;
    }
  }, []);

  /** ローカルstateをクリア */
  const clearSessions = useCallback(() => {
    setSessions([]);
  }, []);

  return {
    sessions,
    fetchSessions,
    createSession,
    reactivateSession,
    updateTitle,
    deleteSession,
    clearSessions,
  };
}
