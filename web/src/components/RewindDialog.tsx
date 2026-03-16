import { useEffect } from "react";

interface RewindDialogProps {
  deleteCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 巻き戻し確認ダイアログ（削除件数表示 + 実行/キャンセル） */
export function RewindDialog({ deleteCount, onConfirm, onCancel }: RewindDialogProps) {
  // ESCキーでキャンセル
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      {/* カード */}
      <div className="mx-4 w-full max-w-sm rounded-xl border border-discord-border bg-discord-card p-6 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-discord-text">
          会話を巻き戻しますか？
        </h2>

        <p className="mb-2 text-sm text-discord-muted">
          このメッセージ以降の{" "}
          <span className="font-semibold text-discord-text">{deleteCount}</span>{" "}
          件のメッセージが削除されます。
        </p>
        <p className="mb-5 text-xs text-discord-muted">
          Agent SDKセッションもリセットされます。
        </p>

        {/* ボタン */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg bg-discord-input px-4 py-2 text-sm font-medium text-discord-text transition hover:bg-discord-border"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            実行
          </button>
        </div>
      </div>
    </div>
  );
}
