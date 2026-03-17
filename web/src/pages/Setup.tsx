import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, authHeaders, authHeadersNoBody } from "../config";
import { prepareImage, dataUriToBlob } from "../utils/imageUtils";

/**
 * セットアップページ（新規作成 & 編集 兼用）
 * URLに :id がある場合は編集モード、なければ新規作成モード
 */
export default function Setup() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [aiName, setAiName] = useState("");
  const [personality, setPersonality] = useState("");
  const [appearance, setAppearance] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const [avatarMimeType, setAvatarMimeType] = useState<string>("image/jpeg");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(isEditMode);

  /** 編集モード: 既存のペルソナデータを取得 */
  useEffect(() => {
    if (!isEditMode) return;

    const fetchPersona = async () => {
      try {
        const res = await fetch(`${API_BASE}/persona/${id}`, { headers: authHeadersNoBody() });
        if (!res.ok) throw new Error("取得失敗");
        const data = (await res.json()) as {
          persona: {
            id: number;
            name: string;
            system_prompt: string;
            avatar_url: string | null;
          };
        };
        setAiName(data.persona.name);
        setPersonality(data.persona.system_prompt);
        setAppearance((data.persona as Record<string, unknown>).appearance as string || "");
        setAvatarUrl(data.persona.avatar_url);
        setAvatarPreview(data.persona.avatar_url);
      } catch (e) {
        console.error("ペルソナ取得エラー:", e);
        setError("ペルソナの読み込みに失敗しました");
      } finally {
        setFetching(false);
      }
    };

    fetchPersona();
  }, [id, isEditMode]);

  /** アバター画像ファイル選択ハンドラ */
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { dataUri, mimeType, error } = await prepareImage(file);
    if (error) {
      setError(error);
      return;
    }

    // 圧縮済みの data URI を保持（アップロード・プレビュー両用）
    setAvatarFile(file);
    setAvatarDataUri(dataUri);
    setAvatarMimeType(mimeType);
    setAvatarPreview(dataUri);
  };

  /** アバター画像を削除 */
  const handleAvatarRemove = () => {
    setAvatarFile(null);
    setAvatarDataUri(null);
    setAvatarPreview(null);
    setAvatarUrl(null);
  };

  /** AIを作成 or 更新してチャットページへ遷移 */
  const handleSubmit = async () => {
    if (!aiName || !personality) {
      setError("名前と性格プロンプトを入力してください");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // アバターURL決定
      let finalAvatarUrl: string | null | undefined = undefined;

      // 新しいファイルがアップロードされた場合 → 圧縮済みBlobをR2にアップロード
      if (avatarFile && avatarDataUri) {
        setLoadingStatus("アバターアップロード中...");
        try {
          const blob = dataUriToBlob(avatarDataUri);
          const ext = avatarMimeType.split("/")[1] === "jpeg" ? "jpg" : (avatarMimeType.split("/")[1] || "jpg");
          const formData = new FormData();
          formData.append("file", blob, `avatar.${ext}`);
          const uploadRes = await fetch(`${API_BASE}/upload`, {
            method: "POST",
            headers: authHeadersNoBody(),
            body: formData,
          });
          if (uploadRes.ok) {
            const uploadData = (await uploadRes.json()) as { url: string };
            finalAvatarUrl = uploadData.url;
          } else {
            console.warn("アバターアップロード失敗、スキップ");
          }
        } catch (e) {
          console.warn("アバターアップロード失敗:", e);
        }
      }
      // Geminiで生成する場合（ファイル未選択 & 新規作成 & 外見説明あり）
      else if (!isEditMode && !avatarPreview && appearance.trim()) {
        setLoadingStatus("アバター生成中...");
        try {
          const avatarPrompt = appearance.trim() || personality;
          const avatarRes = await fetch(`${API_BASE}/avatar/generate`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              prompt: avatarPrompt,
            }),
          });
          if (avatarRes.ok) {
            const avatarData = (await avatarRes.json()) as { url: string };
            finalAvatarUrl = avatarData.url;
          } else {
            const errData = await avatarRes.text();
            console.warn("アバター生成に失敗しました（スキップ）:", errData);
          }
        } catch (avatarErr) {
          console.warn("アバター生成中にエラー（スキップ）:", avatarErr);
        }
      }
      // アバター削除された場合
      else if (avatarUrl === null && !avatarPreview) {
        finalAvatarUrl = null;
      }

      if (isEditMode) {
        // 更新モード
        setLoadingStatus("AI更新中...");
        const updateBody: Record<string, unknown> = {
          name: aiName,
          systemPrompt: personality,
          appearance: appearance || null,
        };
        if (finalAvatarUrl !== undefined) {
          updateBody.avatarUrl = finalAvatarUrl;
        }

        const res = await fetch(`${API_BASE}/persona/${id}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify(updateBody),
        });

        if (!res.ok) throw new Error("ペルソナの更新に失敗しました");
        navigate("/");
      } else {
        // 新規作成モード
        setLoadingStatus("AI作成中...");
        const personaRes = await fetch(`${API_BASE}/persona`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: aiName,
            systemPrompt: personality,
            appearance: appearance || null,
            avatarUrl: finalAvatarUrl || null,
          }),
        });

        if (!personaRes.ok) throw new Error("ペルソナの作成に失敗しました");

        const data = (await personaRes.json()) as {
          persona: {
            id: number;
            name: string;
            system_prompt: string;
            avatar_url: string | null;
          };
        };

        localStorage.setItem("personaId", String(data.persona.id));
        navigate("/chat");
      }
    } catch (e) {
      if (!isEditMode) {
        // API未接続時はデモモードで遷移（新規作成のみ）
        console.warn("API未接続、デモモードで遷移します:", e);
        localStorage.setItem(
          "persona",
          JSON.stringify({ name: aiName, personality, avatar: null })
        );
        navigate("/chat");
      } else {
        setError("更新に失敗しました。もう一度試してください。");
        console.error("更新エラー:", e);
      }
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  };

  if (fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-discord-muted">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center px-3 py-4 sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-2xl bg-discord-card p-5 shadow-lg sm:rounded-3xl sm:p-8">
        {/* ヘッダー */}
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-xl font-bold text-discord-text sm:text-2xl">
            {isEditMode ? "AIを編集" : "AvatarCode"}
          </h1>
          {isEditMode && (
            <button
              onClick={() => navigate("/")}
              className="rounded-2xl px-3 py-1.5 text-sm text-discord-muted transition hover:bg-discord-input hover:text-discord-text sm:rounded-3xl"
            >
              戻る
            </button>
          )}
        </div>
        <p className="mb-5 text-xs text-discord-muted sm:mb-6 sm:text-sm">
          {isEditMode
            ? "AIキャラクターの設定を変更できます"
            : "あなただけのAIキャラクターを作りましょう"}
        </p>

        {/* アバタープレビュー & アップロード */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-semibold text-discord-text">
            アバター画像
            <span className="ml-1 font-normal text-discord-muted">（任意）</span>
          </label>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* プレビュー */}
            <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="アバタープレビュー"
                  className="h-16 w-16 rounded-full object-cover border-2 border-discord-border sm:h-20 sm:w-20"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-discord-input border-2 border-dashed border-discord-border text-discord-muted text-xl sm:h-20 sm:w-20 sm:text-2xl">
                  {aiName ? aiName.charAt(0).toUpperCase() : "?"}
                </div>
              )}
            </div>

            {/* ボタン群 */}
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer rounded-2xl border border-discord-border px-3 py-1.5 text-center text-sm font-semibold text-discord-text transition hover:bg-discord-input sm:rounded-3xl sm:px-4">
                画像を選択
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
              </label>
              {avatarPreview && (
                <button
                  onClick={handleAvatarRemove}
                  className="rounded-2xl px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-500/10 sm:rounded-3xl sm:px-4"
                >
                  削除
                </button>
              )}
            </div>
          </div>
        </div>

        {/* AI名前 */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold text-discord-text">
            AIの名前
          </label>
          <input
            type="text"
            value={aiName}
            onChange={(e) => setAiName(e.target.value)}
            placeholder="例: MyAI"
            className="w-full rounded-3xl border border-discord-border bg-discord-input px-3 py-2 text-sm text-discord-text placeholder-discord-muted outline-none transition focus:border-discord-accent focus:ring-1 focus:ring-discord-accent"
          />
        </div>

        {/* 性格プロンプト */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold text-discord-text">
            性格プロンプト
          </label>
          <textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="例: 明るくてフレンドリーな性格。語尾に「〜だよ」をつける。趣味はプログラミング。"
            rows={4}
            className="w-full resize-none rounded-3xl border border-discord-border bg-discord-input px-3 py-2 text-sm text-discord-text placeholder-discord-muted outline-none transition focus:border-discord-accent focus:ring-1 focus:ring-discord-accent"
          />
        </div>

        {/* 外見（アバター生成・ワードローブ用） */}
        <div className="mb-6">
          <label className="mb-1 block text-sm font-semibold text-discord-text">
            外見
            <span className="ml-1 font-normal text-discord-muted">
              （アバター生成用・任意）
            </span>
          </label>
          <textarea
            value={appearance}
            onChange={(e) => setAppearance(e.target.value)}
            placeholder="キャラの外見を説明（例: ピンクオレンジのショートヘア、赤い目、小柄な女の子）"
            rows={2}
            className="w-full resize-none rounded-3xl border border-discord-border bg-discord-input px-3 py-2 text-sm text-discord-text placeholder-discord-muted outline-none transition focus:border-discord-accent focus:ring-1 focus:ring-discord-accent"
          />
        </div>

        {/* エラー表示 */}
        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {/* 作成/更新ボタン */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-2xl bg-discord-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-discord-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-3xl sm:py-2.5"
        >
          {loading
            ? loadingStatus || (isEditMode ? "更新中..." : "作成中...")
            : isEditMode
              ? "変更を保存"
              : "AIを作成"}
        </button>
      </div>
    </div>
  );
}
