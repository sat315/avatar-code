import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBridgeWs } from "../hooks/useBridgeWs";
import { useMessages } from "../hooks/useMessages";
import { useFolders } from "../hooks/useFolders";
import { useFileUpload } from "../hooks/useFileUpload";
import { useRewind } from "../hooks/useRewind";
import { useSessions } from "../hooks/useSessions";
import { useTabNotification } from "../hooks/useTabNotification";
import { ActivityStatus } from "../components/ActivityStatus";
import type { PermissionRequest } from "../components/ToolApprovalBar";
import { ChatHeader } from "../components/ChatHeader";
import { ChatInput } from "../components/ChatInput";
import { MessageList } from "../components/MessageList";
import { AddFolderModal } from "../components/AddFolderModal";
import { DiffModal } from "../components/DiffModal";
import { RewindDialog } from "../components/RewindDialog";
import { API_BASE, authHeaders, authHeadersNoBody } from "../config";
import { resolveUrl } from "../utils/resolveUrl";
import { applyPwaIcon } from "../utils/pwaIcon";
import { Sidebar } from "../components/Sidebar";
import type { Message, BridgeStatus, ToolActivity, Folder, Session } from "../types/chat";

/**
 * チャットページ（オーケストレーター）
 * 各カスタムフック・コンポーネントを統合し、データフローを管理する
 */
export default function Chat() {
  const navigate = useNavigate();

  // ---- ペルソナ情報 ----
  const [aiName, setAiName] = useState("AI");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const rawAvatarUrlRef = useRef<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");

  // ---- セッション・ストリーミング状態 ----
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [_permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [permissionMode, setPermissionMode] = useState<string>(() => localStorage.getItem("permissionMode") || "default");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ---- Diff モーダル ----
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffData, setDiffData] = useState<{ diff: string; loading: boolean; error: string | null }>({
    diff: "", loading: false, error: null,
  });

  // ---- ツールアクティビティ ----
  const toolActivitiesRef = useRef<ToolActivity[]>([]);
  const [activityStatus, setActivityStatus] = useState<string | null>(null);

  // ---- ストリーミング用ref ----
  const aiContentRef = useRef("");
  const thinkingRef = useRef("");

  // ---- DOM ref ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- 各種ref ----
  const personaIdRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const lastUserMessageRef = useRef<string>("");
  const uploadImagePromiseRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const lastAgentSessionIdRef = useRef<string | null>(null);
  const isSessionSwitchingRef = useRef<boolean>(false); // セッション切替中はWS切断エフェクトを無視

  // activeSessionIdが変わったらrefも同期
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // ---- カスタムフック ----
  const {
    messages, setMessages, loadingOlder,
    loadSessionMessages, loadPersonaMessages, loadOlderMessages,
    addMessage, updateLastAi, clearMessages, rewindAfter, isLoadingOlderRef,
    setHasMore,
  } = useMessages(personaIdRef);

  const {
    folders, selectedFolder, showAddFolderModal,
    syncFoldersFromBridge, selectFolder, addFolder, deleteFolder,
    setShowAddFolderModal, restoreSavedFolder,
  } = useFolders();

  const {
    imagePreview, uploadError, fileInputRef,
    handlePaste, handleFileSelect, clearPreview,
  } = useFileUpload();

  // ---- セッション管理フック ----
  const {
    sessions, fetchSessions, createSession,
    reactivateSession, updateTitle, deleteSession, clearSessions,
  } = useSessions();

  // ---- タブ通知 ----
  const { notify: notifyTab, stop: stopTabNotification } = useTabNotification();

  // 承認待ちが発生したらタブ通知、全解決したら停止
  useEffect(() => {
    if (_permissionRequests.length > 0) {
      notifyTab("approval");
    } else {
      stopTabNotification();
      // 通知終了後に persona favicon を確実に復元（stop() が favicon をリセットする場合に備えて）
      applyPwaIcon();
    }
  }, [_permissionRequests, notifyTab, stopTabNotification]);

  // 接続が切れたらタブ通知、再接続したら停止
  useEffect(() => {
    if (bridgeStatus === "offline") {
      notifyTab("disconnected");
    } else if (bridgeStatus === "online") {
      stopTabNotification();
      // WS 再接続後に persona favicon を確実に復元（stop() が favicon をリセットする場合に備えて）
      applyPwaIcon();
    }
  }, [bridgeStatus, notifyTab, stopTabNotification]);

  // ---- WebSocket接続フック ----
  const ws = useBridgeWs({
    onStreamDelta: useCallback((text: string) => {
      aiContentRef.current += text;
      const content = aiContentRef.current;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "ai", content };
        return updated;
      });
    }, [setMessages]),
    onThinkingDelta: useCallback((text: string) => {
      thinkingRef.current += text;
      const thinking = thinkingRef.current;
      updateLastAi((msg) => ({ ...msg, thinking }));
    }, [updateLastAi]),
    onAssistant: useCallback((message: unknown) => {
      const msg = message as { type?: string; id?: string; name?: string; input?: unknown };
      if (msg.type === "tool_use" && msg.id && msg.name) {
        const activity: ToolActivity = {
          toolUseId: msg.id,
          toolName: msg.name,
          input: msg.input,
          status: "running",
        };
        toolActivitiesRef.current = [...toolActivitiesRef.current, activity];

        // ステータス更新
        const input = msg.input as Record<string, unknown> | undefined;
        const n = msg.name.toLowerCase();
        let statusText = `${msg.name} を実行中...`;
        if (n.includes("read") && input?.file_path) statusText = `${String(input.file_path).split(/[/\\]/).pop()} を読んでいます...`;
        if (n.includes("bash") && input?.command) statusText = `コマンド実行中...`;
        if (n.includes("edit") && input?.file_path) statusText = `${String(input.file_path).split(/[/\\]/).pop()} を編集中...`;
        if (n.includes("write") && input?.file_path) statusText = `${String(input.file_path).split(/[/\\]/).pop()} を書き込み中...`;
        if (n.includes("grep")) statusText = `コード検索中...`;
        if (n.includes("glob")) statusText = `ファイル検索中...`;
        setActivityStatus(statusText);

        updateLastAi((last) => ({ ...last, toolActivities: [...toolActivitiesRef.current] }));
      }
    }, [updateLastAi]),
    onResult: useCallback((
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
    ) => {
      const aiContent = aiContentRef.current || result;
      setStreaming(false);

      // 巻き戻し中なら保存をスキップ
      if (isRewindingRef.current) return;

      // 最後のAIメッセージにusage情報を付与
      const messageUsage = { ...usage, durationMs };
      updateLastAi((last) => ({ ...last, usage: messageUsage }));

      // D1にメッセージ保存（失敗時は2秒後に1回リトライ）
      // ※ AIメッセージのIDを取得して画像生成後にPATCHで保存するため先に実行
      const personaId = personaIdRef.current;
      let savedAiMessageId: number | null = null;
      // savePromise: 画像生成より先にバッチ保存のIDを確定させるための Promise
      let savePromise: Promise<void> = Promise.resolve();
      if (personaId && aiContent) {
        const userContent = lastUserMessageRef.current;
        const sessionId = activeSessionIdRef.current;
        // アップロード完了を待ってからバッチ保存（画像URLをDBに含めるため）
        savePromise = (async () => {
          const uploadedImageUrl = await uploadImagePromiseRef.current;
          const body = JSON.stringify({
            personaId: Number(personaId),
            ...(sessionId ? { sessionId } : {}),
            messages: [
              {
                role: "user",
                content: userContent || "[画像]",
                ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : {}),
              },
              { role: "assistant", content: aiContent, usage: messageUsage },
            ],
          });
          const trySave = () =>
            fetch(`${API_BASE}/messages/batch`, {
              method: "POST",
              headers: authHeaders(),
              body,
            }).then(async (r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const data = await r.json() as { success: boolean; count: number; ids?: number[] };
              // ids の最後がAIメッセージのID（user, assistant の順で挿入）
              if (data.ids && data.ids.length >= 2) {
                savedAiMessageId = data.ids[data.ids.length - 1];
              }
            });

          await trySave().catch((err) => {
            console.warn("メッセージ保存失敗（リトライします）:", err);
            return new Promise<void>((resolve) => {
              setTimeout(() => {
                trySave().catch((err2) => {
                  console.warn("メッセージ保存失敗（最終）:", err2);
                  setErrorMessage("会話の保存に失敗しました。通信状態を確認してください。");
                }).finally(resolve);
              }, 2000);
            });
          });
        })();
      }

      // [IMG:] / [SELFIE:] タグの画像生成処理
      const imgMatches = [...aiContent.matchAll(/\[IMG:([^\]]+)\]/g)];
      const selfieMatches = [...aiContent.matchAll(/\[SELFIE:([^\]]+)\]/g)];
      if (imgMatches.length > 0 || selfieMatches.length > 0) {
        // 画像生成中フラグをセット（スピナー表示のトリガー）
        updateLastAi((last) => ({ ...last, pendingImages: true }));
        (async () => {
          // バッチ保存（savedAiMessageId の確定）を待ってから画像生成する
          // ← これがないと PATCH 時に savedAiMessageId が null のままになるレースコンディションが発生
          await savePromise;
          const generatedImages: string[] = [];

          // [IMG:] → プロンプトのみで新規アバター生成
          for (const match of imgMatches) {
            try {
              const res = await fetch(`${API_BASE}/avatar/generate`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ prompt: match[1] }),
              });
              const data = await res.json() as { url?: string; image?: string; mimeType?: string };
              if (data.url) {
                // Worker が返す { url: "/upload/..." } 形式
                const fullUrl = data.url.startsWith("http")
                  ? data.url
                  : `${API_BASE}${data.url}`;
                generatedImages.push(fullUrl);
              } else if (data.image && data.mimeType) {
                // 後方互換: base64 形式
                generatedImages.push(`data:${data.mimeType};base64,${data.image}`);
              }
            } catch (e) {
              console.warn("画像生成失敗:", e);
            }
          }

          // [SELFIE:] → ペルソナのアクティブ衣装を参照した自撮り生成
          for (const match of selfieMatches) {
            try {
              const res = await fetch(`${API_BASE}/selfie/generate`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                  personaId: Number(personaIdRef.current),
                  prompt: match[1].trim(),
                  // costumeUrl は送らない: activate API が personas.avatar_url を衣装画像に
                  // 同期更新するため、DB の JOIN 結果を優先させる（古い avatar_url を渡すと
                  // 衣装より元アバターが優先されてしまうバグを防ぐ）
                }),
              });
              const data = await res.json() as { url?: string; error?: string };
              if (data.url) {
                const fullUrl = data.url.startsWith("http")
                  ? data.url
                  : `${API_BASE}${data.url}`;
                generatedImages.push(fullUrl);
              } else if (res.status === 429) {
                setErrorMessage("自撮り生成のレート制限に達しました。少し待ってから再度試してみてね！");
              } else if (!res.ok) {
                console.warn("自撮り生成失敗:", data.error);
              }
            } catch (e) {
              console.warn("自撮り生成失敗:", e);
            }
          }

          // 生成完了（成功・失敗問わず pendingImages を解除）
          if (generatedImages.length > 0) {
            // メモリ上のメッセージを更新（生成画像をセット + pendingImages 解除）
            updateLastAi((last) => ({ ...last, generatedImages, pendingImages: false }));

            // DBのAIメッセージに生成画像URLを保存（リロード後も復元できるように）
            if (savedAiMessageId) {
              fetch(`${API_BASE}/messages/${savedAiMessageId}`, {
                method: "PATCH",
                headers: authHeaders(),
                body: JSON.stringify({ generatedImages }),
              }).catch((e) => console.warn("生成画像の保存失敗:", e));
            }
          } else {
            // 生成失敗時も pendingImages を解除してスピナーを止める
            updateLastAi((last) => ({ ...last, pendingImages: false }));
          }
        })();
      }

    }, [updateLastAi, setMessages, setErrorMessage]),
    onToolResult: useCallback((toolUseId: string, result: unknown) => {
      toolActivitiesRef.current = toolActivitiesRef.current.map((a) =>
        a.toolUseId === toolUseId ? { ...a, status: "done" as const, result } : a
      );
      setActivityStatus(null);
      updateLastAi((last) => ({ ...last, toolActivities: [...toolActivitiesRef.current] }));
    }, [updateLastAi]),
    onPermissionRequest: useCallback((toolUseId: string, toolName: string, input: unknown) => {
      const existing = toolActivitiesRef.current.find((a) => a.toolUseId === toolUseId);
      if (existing) {
        toolActivitiesRef.current = toolActivitiesRef.current.map((a) =>
          a.toolUseId === toolUseId ? { ...a, status: "pending_approval" as const } : a
        );
      } else {
        toolActivitiesRef.current = [...toolActivitiesRef.current, {
          toolUseId, toolName, input, status: "pending_approval" as const,
        }];
      }
      setActivityStatus(`${toolName} の承認待ち...`);
      updateLastAi((last) => ({ ...last, toolActivities: [...toolActivitiesRef.current] }));
      setPermissionRequests((prev) => [...prev, { toolUseId, toolName, input }]);
    }, [updateLastAi]),
    onError: useCallback((message: string) => {
      setErrorMessage(message);
      setStreaming(false);
    }, []),
    onStatusChange: useCallback((status: "connecting" | "connected" | "disconnected") => {
      switch (status) {
        case "connected": setBridgeStatus("online"); break;
        case "connecting": setBridgeStatus("checking"); break;
        case "disconnected": setBridgeStatus("offline"); break;
      }
    }, []),
    onDiffResult: useCallback((diff: string, error: string | null) => {
      setDiffData({ diff, loading: false, error });
    }, []),
  });

  // ---- 巻き戻しフック ----
  const {
    rewindTarget, isRewindingRef,
    openRewind, executeRewind, cancelRewind,
  } = useRewind({
    messages,
    setMessages,
    interrupt: ws.interrupt,
    resetSession: ws.resetSession,
    rewindAfter,
    activeSessionIdRef,
    lastAgentSessionIdRef,
    setStreaming,
  });

  // ---- 初期化 ----
  useEffect(() => {
    const init = async () => {
      const personaId = localStorage.getItem("personaId");
      personaIdRef.current = personaId;

      if (personaId) {
        try {
          // ペルソナ情報を取得
          const personaRes = await fetch(`${API_BASE}/persona/${personaId}`, { headers: authHeadersNoBody() });
          if (personaRes.ok) {
            const data = (await personaRes.json()) as { persona: { name: string; avatar_url: string | null; system_prompt: string } };
            setAiName(data.persona.name);
            setAvatarUrl(resolveUrl(data.persona.avatar_url));
            rawAvatarUrlRef.current = data.persona.avatar_url;
            setSystemPrompt(data.persona.system_prompt);
          }

          // フォルダ一覧を同期・復元
          const dbFolders = await syncFoldersFromBridge();
          const savedFolder = restoreSavedFolder(dbFolders);

          // フォルダ選択状態に応じて履歴読み込み
          if (savedFolder) {
            const sessionId = await loadSessionMessages(savedFolder.id);
            if (sessionId) setActiveSessionId(sessionId);
            // セッション一覧も取得
            fetchSessions(savedFolder.id);
          } else {
            await loadPersonaMessages();
          }
          // 初回ロード完了 → DOM描画を待ってからスクロール
          setTimeout(() => {
            initialLoadDoneRef.current = true;
            scrollToBottom(true);
          }, 100);
          return;
        } catch (e) {
          console.warn("API取得失敗、localStorageにフォールバック:", e);
        }
      }

      // デモモード
      const stored = localStorage.getItem("persona");
      if (stored) {
        const parsed = JSON.parse(stored);
        setAiName(parsed.name || "AI");
        setSystemPrompt(parsed.personality || "");
      }

      // デモモードでもフォルダ一覧は取得
      (async () => {
        try {
          const dbFolders = await syncFoldersFromBridge();
          restoreSavedFolder(dbFolders);
        } catch (e) {
          console.warn("フォルダ一覧取得失敗:", e);
        }
      })();
    };

    init();
    ws.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- ページフォーカス時にペルソナ情報を再取得 ----
  useEffect(() => {
    const handleFocus = async () => {
      const personaId = personaIdRef.current;
      if (!personaId) return;
      try {
        const res = await fetch(`${API_BASE}/persona/${personaId}`, { headers: authHeadersNoBody() });
        if (!res.ok) return;
        const data = (await res.json()) as { persona: { name: string; avatar_url: string | null; system_prompt: string } };
        setAiName(data.persona.name);
        setAvatarUrl(resolveUrl(data.persona.avatar_url));
        rawAvatarUrlRef.current = data.persona.avatar_url;
        setSystemPrompt(data.persona.system_prompt);
      } catch { /* 失敗しても何もしない */ }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // ---- スクロール制御 ----
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  /** 初回ロード完了フラグ（初回は即座にスクロール） */
  const initialLoadDoneRef = useRef(false);
  const scrollToBottom = useCallback((instant?: boolean) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: instant || streamingRef.current ? "instant" : "smooth",
    });
  }, []);

  useEffect(() => {
    if (!isLoadingOlderRef.current && initialLoadDoneRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom, isLoadingOlderRef]);

  // ---- WS切断によるセッション喪失検知 ----
  const prevSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = ws.sessionId;
    if (ws.sessionId) {
      lastAgentSessionIdRef.current = ws.sessionId;
    }
    if (prev && !ws.sessionId) {
      setStreaming(false);
      setActivityStatus(null);
      // セッション切替中（isSessionSwitchingRef）はis_active更新・警告メッセージをスキップ
      if (!isSessionSwitchingRef.current) {
        setMessages((msgs) => [
          ...msgs,
          { role: "ai", content: "⚠️ 接続が切れたためセッションが終了しました。メッセージを送ると自動で復元されます。", isSeparator: true },
        ]);
        // WS切断時にDBのis_activeを0に更新（緑丸を消す）
        if (activeSessionId) {
          fetch(`${API_BASE}/sessions/${activeSessionId}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ is_active: 0 }),
          }).catch(() => {});
        }
      }
      isSessionSwitchingRef.current = false;
    }
  }, [ws.sessionId, setMessages, activeSessionId]);

  // ---- ページリロード/離脱時にis_activeを0に更新（keepalive=trueで確実に完了） ----
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;
      fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ is_active: 0 }),
        keepalive: true,  // ページアンロード後もリクエストを完走させる
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ---- ページネーション（上端検知） ----
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = mainRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadOlderMessages(activeSessionIdRef.current, mainRef);
        }
      },
      { root: container, threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlderMessages]);

  // ---- 画像URL解決 ----
  const resolveImageUrl = useCallback((url: string): string => {
    if (url.startsWith("http")) return url;
    const normalized = url.startsWith("/api/upload/")
      ? url.replace("/api/upload/", "/upload/")
      : url;
    return `${API_BASE}${normalized}`;
  }, []);

  // ---- 生成画像の再生成 ----
  const handleRegenerateImage = useCallback(async (msg: Message, imageIndex: number) => {
    // メッセージ内の [IMG:] / [SELFIE:] プロンプトを抽出
    const imgMatches = [...msg.content.matchAll(/\[IMG:([^\]]+)\]/g)];
    const selfieMatches = [...msg.content.matchAll(/\[SELFIE:([^\]]+)\]/g)];

    let newUrl: string | null = null;

    if (imageIndex < imgMatches.length) {
      // [IMG:] タグの再生成
      try {
        const res = await fetch(`${API_BASE}/avatar/generate`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ prompt: imgMatches[imageIndex][1] }),
        });
        const data = await res.json() as { url?: string };
        if (data.url) {
          newUrl = data.url.startsWith("http") ? data.url : `${API_BASE}${data.url}`;
        }
      } catch (e) {
        console.warn("画像再生成失敗:", e);
      }
    } else {
      // [SELFIE:] タグの再生成
      const selfieIndex = imageIndex - imgMatches.length;
      if (selfieIndex < selfieMatches.length) {
        try {
          const res = await fetch(`${API_BASE}/selfie/generate`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              personaId: Number(personaIdRef.current),
              prompt: selfieMatches[selfieIndex][1].trim(),
            }),
          });
          const data = await res.json() as { url?: string };
          if (data.url) {
            newUrl = data.url.startsWith("http") ? data.url : `${API_BASE}${data.url}`;
          }
        } catch (e) {
          console.warn("自撮り再生成失敗:", e);
        }
      }
    }

    if (!newUrl) return;

    // state を更新（指定インデックスの画像だけ差し替え）
    const updatedImages = [...(msg.generatedImages ?? [])];
    updatedImages[imageIndex] = newUrl;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, generatedImages: updatedImages } : m
      )
    );

    // DB を更新
    if (msg.id) {
      fetch(`${API_BASE}/messages/${msg.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ generatedImages: updatedImages }),
      }).catch((e) => console.warn("再生成画像の保存失敗:", e));
    }
  }, [personaIdRef, setMessages]);

  // ---- エラーメッセージ定数 ----
  const ERR_SESSION_CREATE = "セッションの作成に失敗しました。会話は続けられますが、履歴が保存されない場合があります。";

  // ---- ツール承認/拒否 ----
  const handleApprove = (toolUseId: string) => {
    ws.approve(toolUseId);
    setPermissionRequests((prev) => prev.filter((r) => r.toolUseId !== toolUseId));
    toolActivitiesRef.current = toolActivitiesRef.current.map((a) =>
      a.toolUseId === toolUseId ? { ...a, status: "done" as const } : a
    );
    setActivityStatus(null);
    updateLastAi((last) => ({ ...last, toolActivities: [...toolActivitiesRef.current] }));
  };

  const handleReject = (toolUseId: string) => {
    ws.reject(toolUseId, "ユーザーが拒否しました");
    setPermissionRequests((prev) => prev.filter((r) => r.toolUseId !== toolUseId));
    toolActivitiesRef.current = toolActivitiesRef.current.map((a) =>
      a.toolUseId === toolUseId ? { ...a, status: "done" as const } : a
    );
    setActivityStatus(null);
    updateLastAi((last) => ({ ...last, toolActivities: [...toolActivitiesRef.current] }));
  };

  // ---- メッセージ送信 ----
  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !imagePreview) || streaming) return;
    lastUserMessageRef.current = text;
    setErrorMessage(null);

    const currentImage = imagePreview;

    // 画像がある場合、バックグラウンドでR2にアップロード開始
    // onResult でアップロード完了を待ってからDBに imageUrl を保存する
    if (currentImage) {
      uploadImagePromiseRef.current = (async () => {
        try {
          // data URIからMIMEタイプを明示的に抽出してBlobを作成
          // （fetch(dataURI).blob()はブラウザによってtypeが消えることがある）
          const mimeMatch = currentImage.match(/^data:([^;]+);base64,/);
          const mimeType = mimeMatch?.[1] || "image/jpeg";
          const base64Data = currentImage.replace(/^data:[^;]+;base64,/, "");
          const binaryStr = atob(base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType });
          const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "jpg";
          const form = new FormData();
          form.append("file", blob, `image.${ext}`);
          const uploadRes = await fetch(`${API_BASE}/upload`, {
            method: "POST",
            headers: authHeadersNoBody(),
            body: form,
          });
          if (uploadRes.ok) {
            const data = await uploadRes.json() as { url: string };
            console.log("[upload] 成功:", data.url);
            return data.url; // "/upload/chat/xxxx.jpg"
          } else {
            const errText = await uploadRes.text().catch(() => "");
            console.warn("[upload] 失敗:", uploadRes.status, errText);
          }
        } catch (e) {
          console.warn("[upload] エラー:", e);
        }
        return null;
      })();
    } else {
      uploadImagePromiseRef.current = Promise.resolve(null);
    }
    const userMessage: Message = { role: "user", content: text, ...(currentImage ? { image: currentImage } : {}) };
    addMessage(userMessage);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    clearPreview();
    setStreaming(true);
    aiContentRef.current = "";
    thinkingRef.current = "";
    toolActivitiesRef.current = [];
    setActivityStatus(null);

    // AI応答用の空メッセージを追加
    addMessage({ role: "ai", content: "" });

    if (ws.status !== "connected") {
      // オフライン時のフォールバック
      const demoText = `こんにちは！${aiName}です。今はおやすみ中です💤 PCが起動したらお話しできるよ！`;
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "ai", content: demoText.slice(0, i) };
          return updated;
        });
        if (i >= demoText.length) {
          clearInterval(interval);
          setStreaming(false);
        }
      }, 30);
      return;
    }

    if (!ws.sessionId) {
      // フォルダが選択されていて未セッションなら新規作成
      if (!activeSessionId && selectedFolder) {
        try {
          const res = await fetch(`${API_BASE}/sessions`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ folder_id: selectedFolder.id }),
          });
          if (res.ok) {
            const data = (await res.json()) as { session: { id: string } };
            setActiveSessionId(data.session.id);
            activeSessionIdRef.current = data.session.id;
            // セッション一覧を更新
            fetchSessions(selectedFolder.id);
          } else {
            console.warn("セッション作成失敗: HTTP", res.status);
            setErrorMessage(ERR_SESSION_CREATE);
          }
        } catch (e) {
          console.warn("セッション作成失敗:", e);
          setErrorMessage(ERR_SESSION_CREATE);
        }
      } else if (activeSessionId) {
        // 終了セッション表示中なら再アクティブ化
        const currentSession = sessions.find((s) => s.id === activeSessionId);
        if (currentSession && currentSession.is_active === 0) {
          await reactivateSession(activeSessionId);
        }
      }

      // Agent SDKセッション復元できない場合、会話履歴をコンテキストとして付与
      let promptWithContext = text;
      if (!lastAgentSessionIdRef.current && messages.length > 1) {
        // 直前のメッセージ（最新のuser/ai空メッセージを除く）からコンテキスト構築
        const historyMessages = messages.slice(0, -1).filter((m) => !m.isSeparator && m.content);
        if (historyMessages.length > 0) {
          const context = historyMessages
            .map((m) => `${m.role === "user" ? "ユーザー" : "アシスタント"}: ${m.content}`)
            .join("\n\n");
          promptWithContext = `<conversation_history>\n${context}\n</conversation_history>\n\n${text}`;
        }
      }

      ws.start({
        model: "claude-sonnet-4-6",
        permissionMode,
        systemPrompt: systemPrompt || undefined,
        personaId: personaIdRef.current || undefined,
        initialPrompt: promptWithContext,
        image: currentImage || undefined,
        cwd: selectedFolder?.path || undefined,
        resumeSessionId: lastAgentSessionIdRef.current || undefined,
      });
    } else {
      ws.sendInput(text, currentImage || undefined);
    }

    // セッションタイトルが未設定なら最初のメッセージから自動設定
    if (activeSessionIdRef.current) {
      const currentSession = sessions.find((s) => s.id === activeSessionIdRef.current);
      if (currentSession && !currentSession.title) {
        updateTitle(activeSessionIdRef.current, text.slice(0, 30));
      }
    }
  };

  // ---- フォルダ選択ハンドラ ----
  const handleSelectFolder = async (folder: Folder) => {
    if (ws.sessionId) ws.interrupt();
    setStreaming(false);
    aiContentRef.current = "";
    thinkingRef.current = "";

    if (!folder.id) {
      selectFolder(null);
      setActiveSessionId(null);
      clearSessions();
      await loadPersonaMessages();
      return;
    }

    selectFolder(folder);
    clearMessages();
    setActiveSessionId(null);

    // セッション一覧を取得
    fetchSessions(folder.id);

    const sessionId = await loadSessionMessages(folder.id);
    if (sessionId) setActiveSessionId(sessionId);
  };

  /** セッション選択ハンドラ（セッション切り替え → メッセージ読み込み） */
  const handleSelectSession = async (session: Session) => {
    // 切り替え前に旧セッションをDBで非アクティブにする（refより先に取得！）
    const prevSessionId = activeSessionId;
    if (prevSessionId && prevSessionId !== session.id) {
      fetch(`${API_BASE}/sessions/${prevSessionId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ is_active: 0 }),
      }).catch(() => {});
    }

    // WS切断エフェクトがis_active=0を新セッションに誤送信しないようフラグを立てる
    isSessionSwitchingRef.current = true;
    if (ws.sessionId) ws.interrupt();
    setStreaming(false);
    aiContentRef.current = "";
    thinkingRef.current = "";

    // refを先に同期更新（clearMessages後のIntersectionObserver誤発火を防ぐ）
    activeSessionIdRef.current = session.id;
    setActiveSessionId(session.id);
    clearMessages(); // hasMore = false になり loadOlderMessages が発火しない

    // 選択したセッションのメッセージをAPIから直接取得
    try {
      const res = await fetch(
        `${API_BASE}/messages/session/${session.id}?limit=50`,
        { headers: authHeadersNoBody() }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          messages: Array<{
            id: number;
            role: "user" | "assistant";
            content: string;
            image_url?: string | null;
            usage_json?: string | null;
            generated_images_json?: string | null;
          }>;
        };
        setMessages(data.messages.map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "ai" as const : "user" as const,
          content: m.content,
          imageUrl: m.image_url || undefined,
          pendingImages: false,
          ...(m.role === "assistant" && m.usage_json
            ? { usage: JSON.parse(m.usage_json) }
            : {}),
          generatedImages: (m.role === "assistant" && m.generated_images_json)
            ? JSON.parse(m.generated_images_json) as string[]
            : [],
        })));
        setHasMore(data.messages.length >= 50); // フェッチ完了後にhasMoreを正しく設定
      } else {
        setHasMore(true); // フェッチ失敗時はリセット
      }
    } catch (e) {
      console.warn("セッションメッセージ取得失敗:", e);
      setHasMore(true); // エラー時はリセット
    }
    // WSセッションリセット
    ws.resetSession();
    lastAgentSessionIdRef.current = null;

    // DOM描画完了後にスクロール（レースコンディション防止）
    setTimeout(() => scrollToBottom(true), 50);
  };

  /** 新しいセッション作成ハンドラ */
  const handleCreateSession = async () => {
    if (!selectedFolder) return;
    if (ws.sessionId) ws.interrupt();
    setStreaming(false);
    aiContentRef.current = "";
    thinkingRef.current = "";

    const newSession = await createSession(selectedFolder.id, activeSessionId);
    if (newSession) {
      clearMessages();
      setActiveSessionId(newSession.id);
      ws.resetSession();
      lastAgentSessionIdRef.current = null;
    }
  };

  /** セッション削除ハンドラ */
  const handleDeleteSession = async (sessionId: string) => {
    // 表示中のセッションを削除した場合はクリア
    if (sessionId === activeSessionId) {
      clearMessages();
      setActiveSessionId(null);
      ws.resetSession();
      lastAgentSessionIdRef.current = null;
    }
    await deleteSession(sessionId);
  };

  // ---- Diff ----
  const handleOpenDiff = () => {
    setShowDiffModal(true);
    setDiffData({ diff: "", loading: true, error: null });
    ws.getDiff(selectedFolder?.path);
  };

  // ---- ステータス表示 ----
  const statusDisplay = () => {
    if (bridgeStatus === "offline") return { text: "おやすみ中", colorClass: "text-discord-muted" };
    if (bridgeStatus === "checking") return { text: "接続確認中...", colorClass: "text-discord-muted" };
    if (ws.status === "connecting") return { text: "再接続中...", colorClass: "text-yellow-500" };
    if (ws.status === "disconnected" && streaming) return { text: "接続が切れました", colorClass: "text-red-400" };
    if (ws.sessionId && streaming) return { text: "応答中...", colorClass: "text-blue-400" };
    if (ws.sessionId) return { text: "セッション中", colorClass: "text-green-500" };
    return { text: "オンライン", colorClass: "text-green-500" };
  };

  const status = statusDisplay();
  const [input, setInput] = useState("");

  // ---- レンダリング ----
  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* サイドバー */}
      <Sidebar
        folders={folders}
        selectedFolderId={selectedFolder?.id || null}
        onSelectFolder={handleSelectFolder}
        onAddFolder={() => setShowAddFolderModal(true)}
        onDeleteFolder={(folderId) => deleteFolder(folderId)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={updateTitle}
      />

      {/* メインコンテンツ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatHeader
          aiName={aiName}
          avatarUrl={avatarUrl}
          statusText={status.text}
          statusColorClass={status.colorClass}
          selectedFolder={selectedFolder}
          sessionTitle={sessions.find((s) => s.id === activeSessionId)?.title || null}
          permissionMode={permissionMode}
          wsSessionId={ws.sessionId}
          bridgeStatus={bridgeStatus}
          onOpenSidebar={() => setSidebarOpen(true)}
          onNavigateHome={() => navigate("/")}
          onNavigateWardrobe={() => navigate(`/wardrobe/${personaIdRef.current}`)}
          onOpenDiff={handleOpenDiff}
          onPermissionModeChange={(mode) => {
            setPermissionMode(mode);
            localStorage.setItem("permissionMode", mode);
          }}
        />

        {/* メッセージリスト + 上部ホワイトフェードオーバーレイ */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <MessageList
          messages={messages}
          streaming={streaming}
          aiName={aiName}
          avatarUrl={avatarUrl}
          personaId={personaIdRef.current ? Number(personaIdRef.current) : null}
          loadingOlder={loadingOlder}
          mainRef={mainRef}
          topSentinelRef={topSentinelRef}
          messagesEndRef={messagesEndRef}
          aiContentRef={aiContentRef}
          onApprove={handleApprove}
          onReject={handleReject}
          resolveImageUrl={resolveImageUrl}
          onOpenRewind={openRewind}
          onRegenerateImage={handleRegenerateImage}
        />
        </div>

        <ActivityStatus status={activityStatus} />

        {/* エラーメッセージ */}
        {errorMessage && (
          <div className="border-t border-red-300 bg-red-50 px-3 py-2 sm:px-4">
            <div className="mx-auto flex max-w-3xl items-center gap-2">
              <span className="text-sm text-red-600">⚠ {errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="ml-auto shrink-0 text-xs text-red-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <ChatInput
          input={input}
          streaming={streaming}
          imagePreview={imagePreview}
          uploadError={uploadError}
          aiName={aiName}
          textareaRef={textareaRef}
          fileInputRef={fileInputRef}
          onInputChange={setInput}
          onSend={handleSend}
          onInterrupt={() => { ws.interrupt(); setStreaming(false); setActivityStatus(null); }}
          onPaste={handlePaste}
          onFileSelect={handleFileSelect}
          onClearPreview={clearPreview}
        />
      </div>

      {/* モーダル */}
      <AddFolderModal
        isOpen={showAddFolderModal}
        existingPaths={folders.map((f) => f.path)}
        onClose={() => setShowAddFolderModal(false)}
        onSave={(name, path) => addFolder(name, path)}
      />
      {showDiffModal && (
        <DiffModal
          diff={diffData.diff}
          loading={diffData.loading}
          error={diffData.error}
          onClose={() => setShowDiffModal(false)}
        />
      )}
      {rewindTarget && (
        <RewindDialog
          deleteCount={rewindTarget.deleteCount}
          onConfirm={executeRewind}
          onCancel={cancelRewind}
        />
      )}
    </div>
  );
}
