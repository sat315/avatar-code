import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, authHeaders, authHeadersNoBody } from "../config";
import { resolveUrl } from "../utils/resolveUrl";
import { RefreshCw, Shirt, Sun, Moon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

/** APIから取得するペルソナの型 */
interface Persona {
  id: number;
  name: string;
  system_prompt: string;
  avatar_url: string | null;
}

/**
 * ホームページ（ペルソナ一覧 / 選択画面）
 * Discordのサーバー選択風のUIでAIペルソナを一覧表示し、
 * カードクリックでチャットを開始する
 */
export default function Home() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Persona | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState<string | null>(null);

  /** ブリッジサーバーのデプロイを実行 */
  const handleDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    setDeployMessage(null);
    try {
      const res = await fetch(`${API_BASE}/deploy`, { method: "POST", headers: authHeaders() });
      const data = (await res.json()) as {
        status: string;
        message: string;
        output?: string;
      };
      if (data.status === "ok") {
        setDeployMessage(`✅ ${data.message}`);
      } else {
        setDeployMessage(`❌ ${data.message}`);
      }
    } catch {
      setDeployMessage("❌ デプロイに失敗しました");
    } finally {
      setDeploying(false);
      // 5秒後にメッセージを消す
      setTimeout(() => setDeployMessage(null), 5000);
    }
  };

  /** ペルソナ一覧を取得（API未接続時はlocalStorageフォールバック） */
  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        const res = await fetch(`${API_BASE}/persona`, { headers: authHeadersNoBody() });
        if (!res.ok) throw new Error("取得失敗");
        const data = (await res.json()) as { personas: Persona[] };
        setPersonas(data.personas);
      } catch (e) {
        console.warn("API未接続、localStorageからフォールバック:", e);
        // デモモード: localStorageに保存されたペルソナを1件表示
        const stored = localStorage.getItem("persona");
        if (stored) {
          const parsed = JSON.parse(stored);
          setPersonas([
            {
              id: -1,
              name: parsed.name || "AI",
              system_prompt: parsed.personality || "",
              avatar_url: parsed.avatar || null,
            },
          ]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPersonas();
  }, []);

  /** ペルソナを選択してチャット画面へ遷移 */
  const handleSelect = (persona: Persona) => {
    localStorage.setItem("personaId", String(persona.id));
    navigate("/chat");
  };

  /** ペルソナを削除 */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      if (deleteTarget.id !== -1) {
        // API経由で削除
        const res = await fetch(`${API_BASE}/persona/${deleteTarget.id}`, {
          method: "DELETE",
          headers: authHeadersNoBody(),
        });
        if (!res.ok) throw new Error("削除失敗");
      }

      // ローカル状態から削除
      setPersonas((prev) => prev.filter((p) => p.id !== deleteTarget.id));

      // 削除対象が現在選択中のペルソナなら選択をクリア
      const currentId = localStorage.getItem("personaId");
      if (currentId === String(deleteTarget.id)) {
        localStorage.removeItem("personaId");
      }

      // デモモードのペルソナを削除した場合
      if (deleteTarget.id === -1) {
        localStorage.removeItem("persona");
      }
    } catch (e) {
      console.error("ペルソナ削除に失敗しました:", e);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  /** 性格プロンプトの冒頭を表示用にトリミング */
  const truncatePrompt = (text: string, maxLength = 60) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  /** アバターアイコン（画像 or 頭文字） */
  const AvatarIcon = ({
    persona,
    size = "lg",
  }: {
    persona: Persona;
    size?: "lg" | "sm";
  }) => {
    const sizeClass = size === "lg" ? "h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl" : "h-10 w-10 text-sm sm:h-12 sm:w-12 sm:text-base";

    if (resolveUrl(persona.avatar_url)) {
      return (
        <img
          src={resolveUrl(persona.avatar_url)!}
          alt={persona.name}
          className={`${sizeClass} rounded-full object-cover`}
        />
      );
    }

    return (
      <div
        className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-discord-accent font-bold text-discord-sidebar`}
      >
        {persona.name.charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden">
      {/* デプロイ結果トースト */}
      {deployMessage && (
        <div className="fixed right-4 top-4 z-50 rounded-lg border border-discord-border bg-discord-card px-4 py-2 text-sm text-discord-text shadow-lg">
          {deployMessage}
        </div>
      )}

      {/* ヘッダー */}
      <header className="border-b border-discord-border bg-discord-sidebar px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-discord-text sm:text-xl">AvatarCode</h1>
            <p className="text-xs text-discord-muted sm:text-sm">
              あなただけのAIキャラクターを選んでチャットしよう
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* テーマトグルボタン */}
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
              className="rounded-lg border border-discord-border bg-discord-input p-1.5 text-discord-muted transition hover:bg-discord-card hover:text-discord-text"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {/* デプロイボタン */}
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="rounded-lg bg-discord-input px-3 py-1.5 text-xs text-discord-muted transition hover:bg-discord-border hover:text-discord-text disabled:opacity-50"
              title="ブリッジサーバーを更新"
            >
              {deploying ? "更新中..." : <><RefreshCw size={14} className="inline" /> 更新</>}
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-4xl">
          {/* ローディング */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-discord-muted">読み込み中...</p>
            </div>
          )}

          {/* ペルソナが0件の場合 */}
          {!loading && personas.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-discord-border px-4 py-16 sm:rounded-3xl sm:py-20">
              <p className="mb-2 text-base font-semibold text-discord-text sm:text-lg">
                まだAIがいません
              </p>
              <p className="mb-6 text-xs text-discord-muted sm:text-sm">
                最初のAIキャラクターを作ってみましょう！
              </p>
              <button
                onClick={() => navigate("/setup")}
                className="rounded-2xl bg-discord-accent px-6 py-2.5 text-sm font-semibold text-discord-sidebar transition hover:bg-discord-accent-hover sm:rounded-3xl"
              >
                AIを作成する
              </button>
            </div>
          )}

          {/* ペルソナ一覧グリッド */}
          {!loading && personas.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-between sm:mb-6">
                <h2 className="text-sm font-semibold text-discord-text sm:text-base">
                  あなたのAI ({personas.length})
                </h2>
                <button
                  onClick={() => navigate("/setup")}
                  className="rounded-2xl bg-discord-accent px-3 py-1.5 text-xs font-semibold text-discord-sidebar transition hover:bg-discord-accent-hover sm:rounded-3xl sm:px-4 sm:py-2 sm:text-sm"
                >
                  + 新しいAIを作る
                </button>
              </div>

              <div className="divide-y divide-discord-border border-y border-discord-border">
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    className="group relative cursor-pointer py-4 transition sm:py-5"
                    onClick={() => handleSelect(persona)}
                  >
                    {/* 編集・削除ボタン（モバイルでは常時表示、PCではホバー表示） */}
                    <div className="absolute right-2 top-2 flex gap-1 sm:right-3 sm:top-3 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                      {/* 編集ボタン */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/setup/${persona.id}`);
                        }}
                        className="rounded-full p-2 text-discord-muted transition hover:bg-discord-accent/10 hover:text-discord-accent sm:p-1.5"
                        title="編集"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>

                      {/* ワードローブボタン */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/wardrobe/${persona.id}`);
                        }}
                        className="rounded-md bg-discord-input p-1.5 text-discord-muted hover:text-discord-text"
                        title="ワードローブ"
                      >
                        <Shirt size={16} />
                      </button>

                      {/* 削除ボタン */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(persona);
                        }}
                        className="rounded-full p-2 text-discord-muted transition hover:bg-red-500/10 hover:text-red-500 sm:p-1.5"
                        title="削除"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* ペルソナ情報 */}
                    <div className="flex items-center gap-3 sm:gap-4">
                      <AvatarIcon persona={persona} />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-discord-text sm:text-base">
                          {persona.name}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-discord-muted">
                          {truncatePrompt(persona.system_prompt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {/* 削除確認ダイアログ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-discord-card p-5 shadow-xl sm:mx-4 sm:rounded-3xl sm:p-6">
            <h3 className="mb-2 text-base font-semibold text-discord-text sm:text-lg">
              本当に削除しますか？
            </h3>
            <p className="mb-5 text-sm text-discord-muted sm:mb-6">
              「{deleteTarget.name}」を削除すると、会話履歴も失われます。この操作は取り消せません。
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-2xl border border-discord-border px-4 py-2.5 text-sm font-semibold text-discord-text transition hover:bg-discord-input disabled:opacity-50 sm:rounded-3xl sm:py-2"
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50 sm:rounded-3xl sm:py-2"
              >
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
