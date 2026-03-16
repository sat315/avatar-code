import { useEffect, useState } from "react";
import { Markdown } from "./Markdown";

interface FileViewerProps {
  filePath: string | null; // null のとき非表示
  fileName: string;
  onClose: () => void;
  /** ファイル内容取得関数（useFileTree から渡す） */
  readFile: (path: string) => Promise<string | null>;
  /** ファイル保存関数（useFileTree.saveFile） */
  onSave: (path: string, content: string) => Promise<void>;
}

/**
 * ファイル内容をモーダルでプレビュー・編集するコンポーネント
 * .md はMarkdownレンダリング、その他はプレーンテキスト表示
 * 編集モードでは textarea で編集・保存、未保存変更時は警告表示
 */
export function FileViewer({ filePath, fileName, onClose, readFile, onSave }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 編集モード関連
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isMarkdown = fileName.endsWith(".md");
  const isDirty = editing && editText !== (content ?? "");

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setError(null);
      setEditing(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setEditing(false);
    setSaveError(null);

    readFile(filePath).then((text) => {
      if (cancelled) return;
      if (text === null) {
        setError("ファイルを読み込めなかった😢");
      } else {
        setContent(text);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [filePath, readFile]);

  // 未保存変更がある場合、ブラウザ離脱を警告
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleClose = () => {
    if (isDirty) {
      if (!window.confirm("未保存の変更があるよ！閉じてもいい？")) return;
    }
    setEditing(false);
    setEditText("");
    onClose();
  };

  const handleSave = async () => {
    if (!filePath || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(filePath, editText);
      setContent(editText);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!filePath) return null;

  return (
    /* 背景オーバーレイ */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={handleClose}
    >
      <div
        className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-discord-sidebar shadow-2xl sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex shrink-0 items-center justify-between border-b border-discord-border px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-base">{isMarkdown ? "📄" : "📝"}</span>
            <span className="truncate text-sm font-semibold text-discord-text">{fileName}</span>
          </div>
          {/* 編集/プレビュー切替 */}
          {content !== null && (
            <button
              onClick={() => {
                if (!editing) {
                  setEditText(content);
                  setEditing(true);
                  setSaveError(null);
                } else {
                  if (isDirty && !window.confirm("未保存の変更があるよ！プレビューに戻る？")) return;
                  setEditing(false);
                }
              }}
              className="ml-auto mr-2 rounded-md px-2 py-1 text-xs font-medium text-discord-muted transition hover:bg-discord-input hover:text-discord-text"
            >
              {editing ? "👁 プレビュー" : "✏️ 編集"}
            </button>
          )}
          <button
            onClick={handleClose}
            className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-discord-muted transition hover:bg-discord-input hover:text-discord-text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-discord-text">
          {loading && (
            <p className="text-center text-sm text-discord-muted">読み込み中…</p>
          )}
          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}
          {content !== null && !editing && (
            isMarkdown ? (
              <Markdown content={content} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-discord-text">
                {content}
              </pre>
            )
          )}
          {content !== null && editing && (
            <div className="flex h-full flex-col gap-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                autoFocus
                className="min-h-[300px] flex-1 resize-y rounded-lg border border-discord-border bg-discord-input p-3 font-mono text-xs leading-relaxed text-discord-text outline-none focus:border-discord-accent"
                spellCheck={false}
              />
              {saveError && (
                <p className="text-xs text-red-400">{saveError}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                {isDirty && (
                  <span className="text-xs text-discord-muted">未保存の変更あり</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${
                    isDirty && !saving
                      ? "bg-discord-accent text-white hover:bg-discord-accent/80"
                      : "bg-discord-input text-discord-muted cursor-not-allowed"
                  }`}
                >
                  {saving ? "保存中…" : "💾 保存"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
