import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, authHeaders, authHeadersNoBody } from "../config";
import { resolveUrl } from "../utils/resolveUrl";
import { ArrowLeft, Download, Pencil, Trash2, Plus, Shirt, Check, RefreshCw, X, Sparkles, Wand2, Upload, Smartphone } from "lucide-react";

type Costume = {
  id: number;
  persona_id: number;
  label: string;
  image_url: string;
  created_at: string;
};

type PersonaData = {
  id: number;
  name: string;
  appearance: string | null;
  avatar_url: string | null;
  active_costume_id: number | null;
};

export default function Wardrobe() {
  const { personaId } = useParams<{ personaId: string }>();
  const navigate = useNavigate();

  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  // 生成用state
  const [generating, setGenerating] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState("");
  const [genError, setGenError] = useState<string | null>(null);

  // 編集用state
  const [editingLabel, setEditingLabel] = useState(false);
  const [editLabel, setEditLabel] = useState("");

  // アップロード用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PWAアイコン設定
  const [pwaToast, setPwaToast] = useState(false);

  // 戻るボタン（faviconを維持しながら戻る）
  const handleBack = () => {
    const iconUrl = localStorage.getItem("pwaIconUrl");
    if (iconUrl) {
      const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (favicon) favicon.href = iconUrl;
      const touchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
      if (touchIcon) touchIcon.href = iconUrl;
    }
    navigate(-1);
  };

  // データ取得
  useEffect(() => {
    if (!personaId) return;
    (async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          fetch(`${API_BASE}/persona/${personaId}`, { headers: authHeadersNoBody() }).then((r) => r.json()),
          fetch(`${API_BASE}/costumes?persona_id=${personaId}`, { headers: authHeadersNoBody() }).then((r) => r.json()),
        ]);
        setPersona(pRes.persona);
        const list = cRes.costumes || [];
        setCostumes(list);
        if (pRes.persona?.active_costume_id && list.length > 0) {
          const idx = list.findIndex((c: Costume) => c.id === pRes.persona.active_costume_id);
          if (idx >= 0) setSelectedIdx(idx);
        }
      } catch (error) {
        console.error("ワードローブデータ取得エラー:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [personaId]);

  const selected = costumes[selectedIdx] || null;
  const isActive = selected && persona?.active_costume_id === selected.id;

  // 衣装着用
  const handleActivate = async () => {
    if (!selected) return;
    try {
      await fetch(`${API_BASE}/costumes/${selected.id}/activate`, {
        method: "POST",
        headers: authHeaders(),
      });
      setPersona((p) => p ? { ...p, active_costume_id: selected.id, avatar_url: selected.image_url } : p);
    } catch (error) {
      console.error("衣装着用エラー:", error);
    }
  };

  // 衣装削除
  const handleDelete = async () => {
    if (!selected || !confirm(`「${selected.label}」を削除しますか？`)) return;
    try {
      await fetch(`${API_BASE}/costumes/${selected.id}`, {
        method: "DELETE",
        headers: authHeadersNoBody(),
      });
      const newCostumes = costumes.filter((_, i) => i !== selectedIdx);
      setCostumes(newCostumes);
      setSelectedIdx(Math.max(0, selectedIdx - 1));
      if (isActive) {
        const res = await fetch(`${API_BASE}/persona/${personaId}`, { headers: authHeadersNoBody() });
        const data = await res.json();
        setPersona(data.persona);
      }
    } catch (error) {
      console.error("衣装削除エラー:", error);
    }
  };

  // ラベル編集保存
  const handleSaveLabel = async () => {
    if (!selected || !editLabel.trim()) return;
    try {
      await fetch(`${API_BASE}/costumes/${selected.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ label: editLabel.trim() }),
      });
      setCostumes((prev) => prev.map((c, i) => i === selectedIdx ? { ...c, label: editLabel.trim() } : c));
      setEditingLabel(false);
    } catch (error) {
      console.error("ラベル更新エラー:", error);
    }
  };

  // 画像ダウンロード
  const handleDownload = async () => {
    if (!selected) return;
    const url = resolveUrl(selected.image_url);
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${selected.label}.${blob.type.split("/")[1] || "png"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (error) {
      console.error("ダウンロードエラー:", error);
    }
  };

  // AI生成
  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setGenerating(true);
    setGenError(null);
    try {
      const refUrl = selected?.image_url || persona?.avatar_url || undefined;
      const res = await fetch(`${API_BASE}/avatar/generate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          prompt: genPrompt,
          referenceImageUrl: refUrl,
          appearance: persona?.appearance || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || "生成に失敗しました");
        return;
      }
      if (data.url) {
        setPreviewUrl(data.url);
        setPreviewLabel(genPrompt.slice(0, 50));
      }
    } catch (error) {
      console.error("AI生成エラー:", error);
      setGenError("通信エラーが発生しました");
    } finally {
      setGenerating(false);
    }
  };

  // プレビュー採用
  const handleAdopt = async () => {
    if (!previewUrl || !personaId) return;
    const label = previewLabel.trim() || "新しい衣装";
    try {
      const res = await fetch(`${API_BASE}/costumes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ personaId: Number(personaId), label, imageUrl: previewUrl }),
      });
      const data = await res.json();
      if (data.costume) {
        setCostumes((prev) => {
          const next = [...prev, data.costume];
          setSelectedIdx(next.length - 1);
          return next;
        });
      }
      setPreviewUrl(null);
      setGenPrompt("");
    } catch (error) {
      console.error("衣装採用エラー:", error);
    }
  };

  // ホーム画面アイコンに設定
  const handleSetPwaIcon = () => {
    const imageUrl = selected?.image_url || persona?.avatar_url;
    if (!imageUrl || !personaId) return;
    const resolvedUrl = resolveUrl(imageUrl);
    if (!resolvedUrl) return;
    localStorage.setItem("pwaPersonaId", personaId);
    localStorage.setItem("pwaIconUrl", resolvedUrl);
    // 即時反映
    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (favicon) favicon.href = resolvedUrl;
    const touchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (touchIcon) touchIcon.href = resolvedUrl;
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (manifestLink) {
      const workerBase = API_BASE.replace(/\/api$/, "");
      manifestLink.href = `${workerBase}/api/manifest?personaId=${personaId}`;
    }
    setPwaToast(true);
    setTimeout(() => setPwaToast(false), 3500);
  };

  // ファイルアップロード
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !personaId) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: authHeadersNoBody(),
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        const label = file.name.replace(/\.[^.]+$/, "").slice(0, 50) || "アップロード画像";
        const cosRes = await fetch(`${API_BASE}/costumes`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ personaId: Number(personaId), label, imageUrl: data.url }),
        });
        const cosData = await cosRes.json();
        if (cosData.costume) {
          setCostumes((prev) => {
            const next = [...prev, cosData.costume];
            setSelectedIdx(next.length - 1);
            return next;
          });
        }
      }
    } catch (error) {
      console.error("アップロードエラー:", error);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-discord-bg">
        <div className="animate-spin h-8 w-8 border-4 border-discord-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-discord-bg">
      {/* PWAアイコン設定トースト */}
      {pwaToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-discord-accent px-5 py-3 text-sm font-semibold text-white shadow-lg">
          <Smartphone size={14} className="mr-1.5 inline" />
          設定しました！ブラウザの「ホーム画面に追加」で反映されます
        </div>
      )}

      {/* ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-discord-border bg-discord-card px-4 py-3">
        <button onClick={handleBack} className="text-discord-muted hover:text-discord-text text-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-discord-text">
          {persona?.name}のワードローブ
        </h1>
      </div>

      <div className="mx-auto max-w-2xl p-4">
        {/* メインエリア: 正方形プレビュー + 下部衣装グリッド */}
        {costumes.length > 0 ? (
          <div>
            {/* 正方形プレビュー - 大きく正方形 */}
            <div className="flex justify-center">
              <div className="relative w-full max-w-sm sm:max-w-lg aspect-square overflow-hidden rounded-xl border border-discord-border">
                {selected && resolveUrl(selected.image_url) ? (
                  <img
                    src={resolveUrl(selected.image_url)!}
                    alt={selected.label}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-6xl text-discord-muted">
                    {persona?.name?.charAt(0) || "?"}
                  </div>
                )}
                {isActive && (
                  <div className="absolute top-2 right-2 rounded-full bg-discord-accent px-2 py-0.5 text-xs font-bold text-discord-sidebar">
                    着用中
                  </div>
                )}
              </div>
            </div>

            {/* ラベル */}
            <div className="mt-3 text-center">
              {editingLabel ? (
                <div className="flex items-center justify-center gap-2">
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="rounded border border-discord-border bg-discord-input px-2 py-1 text-sm text-discord-text"
                    maxLength={100}
                    autoFocus
                  />
                  <button onClick={handleSaveLabel} className="text-sm text-discord-accent font-semibold">保存</button>
                  <button onClick={() => setEditingLabel(false)} className="text-sm text-discord-muted">取消</button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-discord-text">
                  {selected?.label || "衣装なし"}
                </p>
              )}
            </div>

            {/* アクションボタン */}
            {selected && (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {!isActive && (
                  <button
                    onClick={handleActivate}
                    className="rounded-lg bg-discord-accent px-4 py-1.5 text-sm font-semibold text-discord-sidebar hover:bg-discord-accent-hover"
                  >
                    <Shirt size={16} className="inline" /> 着る
                  </button>
                )}
                <button
                  onClick={handleSetPwaIcon}
                  className="rounded-lg bg-discord-input px-3 py-1.5 text-sm text-discord-text hover:bg-discord-border"
                  title="ホーム画面アイコンに設定"
                >
                  <Smartphone size={16} />
                </button>
                <button onClick={handleDownload} className="rounded-lg bg-discord-input px-3 py-1.5 text-sm text-discord-text hover:bg-discord-border" title="ダウンロード">
                  <Download size={16} />
                </button>
                <button
                  onClick={() => { setEditLabel(selected.label); setEditingLabel(true); }}
                  className="rounded-lg bg-discord-input px-3 py-1.5 text-sm text-discord-text hover:bg-discord-border"
                  title="ラベル編集"
                >
                  <Pencil size={16} />
                </button>
                <button onClick={handleDelete} className="rounded-lg bg-discord-input px-3 py-1.5 text-sm text-red-500 hover:bg-red-50" title="削除">
                  <Trash2 size={16} />
                </button>
              </div>
            )}

            {/* 衣装一覧グリッド */}
            <div className="mt-5 border-t border-discord-border pt-4 grid grid-cols-4 gap-2 sm:grid-cols-5">
              {costumes.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedIdx(i)}
                  className={`relative aspect-square overflow-hidden rounded-lg border-2 ${
                    i === selectedIdx ? "border-discord-accent" : "border-discord-border"
                  }`}
                >
                  {resolveUrl(c.image_url) ? (
                    <img src={resolveUrl(c.image_url)!} alt={c.label} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-discord-input text-discord-muted text-lg">
                      {c.label.charAt(0)}
                    </div>
                  )}
                  {persona?.active_costume_id === c.id && (
                    <div className="absolute bottom-0 left-0 right-0 bg-discord-accent/80 text-center text-[9px] text-discord-sidebar">着用中</div>
                  )}
                </button>
              ))}
              <button
                onClick={() => document.getElementById("add-section")?.scrollIntoView({ behavior: "smooth" })}
                className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-discord-border text-discord-muted hover:border-discord-accent hover:text-discord-accent"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-discord-border bg-discord-card p-8 text-center">
            <div className="mb-3 flex justify-center"><Shirt size={40} className="text-discord-muted" /></div>
            <p className="text-discord-muted">まだ衣装がありません</p>
            <p className="text-sm text-discord-muted mt-1">AI生成やアップロードで追加しよう！</p>
          </div>
        )}

        {/* プレビューモーダル（AI生成結果） */}
        {previewUrl && (
          <div className="mt-4 rounded-xl border-2 border-discord-accent bg-discord-card p-4">
            <p className="text-sm font-semibold text-discord-text mb-2">生成プレビュー</p>
            <div className="aspect-[3/4] max-h-64 overflow-hidden rounded-lg mx-auto">
              <img src={resolveUrl(previewUrl)!} alt="preview" className="h-full w-full object-cover" />
            </div>
            <input
              value={previewLabel}
              onChange={(e) => setPreviewLabel(e.target.value)}
              placeholder="衣装の名前"
              className="mt-3 w-full rounded-lg border border-discord-border bg-discord-input px-3 py-2 text-sm text-discord-text"
              maxLength={100}
            />
            <div className="mt-3 flex gap-2">
              <button onClick={handleAdopt} className="flex-1 rounded-lg bg-discord-green py-2 text-sm font-semibold text-discord-sidebar">
                <Check size={16} className="inline" /> 採用
              </button>
              <button onClick={() => { setPreviewUrl(null); handleGenerate(); }} className="flex-1 rounded-lg bg-discord-input py-2 text-sm font-semibold text-discord-text">
                <RefreshCw size={16} className="inline" /> 再生成
              </button>
              <button onClick={() => setPreviewUrl(null)} className="flex-1 rounded-lg bg-discord-input py-2 text-sm text-discord-muted">
                <X size={16} className="inline" /> やめる
              </button>
            </div>
          </div>
        )}

        {/* 新しい衣装を追加 */}
        <div id="add-section" className="mt-6 rounded-xl border border-discord-border bg-discord-card p-4">
          <p className="text-sm font-semibold text-discord-text mb-3"><Sparkles size={16} className="inline" /> 新しい衣装を追加</p>
          <div className="mb-3">
            <textarea
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder="衣装の説明を入力（例: 赤いドレス、夏の浴衣、メイド服…）"
              className="w-full rounded-lg border border-discord-border bg-discord-input px-3 py-2 text-sm text-discord-text placeholder-discord-muted resize-none"
              rows={2}
            />
            <button
              onClick={handleGenerate}
              disabled={generating || !genPrompt.trim()}
              className="mt-2 w-full rounded-lg bg-discord-accent py-2 text-sm font-semibold text-discord-sidebar hover:bg-discord-accent-hover disabled:opacity-50"
            >
              {generating ? "生成中..." : <><Wand2 size={16} className="inline" /> AI生成</>}
            </button>
            {genError && (
              <p className="mt-2 text-sm text-red-500">{genError}</p>
            )}
          </div>
          <div className="border-t border-discord-border pt-3">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg bg-discord-input py-2 text-sm font-semibold text-discord-text hover:bg-discord-border"
            >
              <Upload size={16} className="inline" /> 画像をアップロード
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
