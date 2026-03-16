import { useState, useEffect } from "react";
import { API_BASE, authHeadersNoBody } from "../config";
import { FolderOpen } from "lucide-react";

interface AddFolderModalProps {
  isOpen: boolean;
  existingPaths: string[]; // DB登録済みフォルダのpath一覧（除外用）
  onClose: () => void;
  onSave: (name: string, path: string) => void;
}

/**
 * フォルダ追加モーダル
 * ブリッジから未登録プロジェクト一覧を取得して選択式で追加
 */
export function AddFolderModal({ isOpen, existingPaths, onClose, onSave }: AddFolderModalProps) {
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // モーダルが開いたらブリッジからプロジェクト一覧を取得
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/chat/projects`, { headers: authHeadersNoBody() })
      .then((res) => {
        if (!res.ok) throw new Error("取得失敗");
        return res.json();
      })
      .then((data: { projects?: string[] }) => {
        if (data.projects) {
          const existingSet = new Set(existingPaths);
          const unregistered = data.projects.filter((name) => !existingSet.has(name));
          setProjects(unregistered);
        }
      })
      .catch(() => {
        setError("ブリッジに接続できません（PCが起動していない可能性があります）");
      })
      .finally(() => setLoading(false));
  }, [isOpen, existingPaths]);

  if (!isOpen) return null;

  /** プロジェクトを選択して追加 */
  const handleSelect = async (name: string) => {
    if (saving) return;
    setSaving(name);
    try {
      await onSave(name, name);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-discord-card p-5 shadow-xl sm:max-w-md sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-discord-text">フォルダを追加</h2>

        {/* ローディング */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-discord-accent border-t-transparent" />
            <span className="ml-2 text-sm text-discord-muted">プロジェクトを検索中...</span>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* プロジェクト一覧 */}
        {!loading && !error && projects.length === 0 && (
          <p className="py-6 text-center text-sm text-discord-muted">
            追加できるプロジェクトはありません
          </p>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="space-y-2">
            {projects.map((name) => (
              <button
                key={name}
                onClick={() => handleSelect(name)}
                disabled={saving !== null}
                className="flex w-full items-center gap-3 rounded-lg border border-discord-border px-4 py-3 text-left transition hover:border-discord-accent hover:bg-discord-input active:scale-[0.98] disabled:opacity-50"
              >
                <FolderOpen size={20} className="text-discord-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-discord-text">{name}</p>
                </div>
                {saving === name ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-discord-accent border-t-transparent" />
                ) : (
                  <span className="text-xs text-discord-muted">追加</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-discord-border py-2.5 text-sm text-discord-text transition hover:bg-discord-input"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
