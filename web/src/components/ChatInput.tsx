import { useCallback, useEffect } from "react";
import { Square } from "lucide-react";

interface ChatInputProps {
  input: string;
  streaming: boolean;
  imagePreview: string | null;
  uploadError?: string | null;
  aiName: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onInterrupt: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearPreview: () => void;
}

/** チャット入力エリア（テキスト入力・画像添付・送信/停止ボタン） */
export function ChatInput({
  input,
  streaming,
  imagePreview,
  uploadError,
  aiName,
  textareaRef,
  fileInputRef,
  onInputChange,
  onSend,
  onInterrupt,
  onPaste,
  onFileSelect,
  onClearPreview,
}: ChatInputProps) {
  /** テキストエリアの高さを自動調整 */
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [textareaRef]);

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  /** Enter で送信、Shift+Enter で改行 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <footer className="border-t border-discord-border bg-discord-sidebar px-2 py-2 pb-[env(safe-area-inset-bottom,8px)] sm:px-4 sm:py-3">
      {uploadError && (
        <div className="mx-auto max-w-3xl px-2 pb-1 sm:px-4">
          <p className="text-xs text-red-400">⚠ {uploadError}</p>
        </div>
      )}
      {imagePreview && (
        <div className="mx-auto max-w-3xl px-2 pb-2 sm:px-4">
          <div className="relative inline-block">
            <img src={imagePreview} alt="添付画像" className="max-h-32 rounded-lg border border-discord-border" />
            <button
              onClick={onClearPreview}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <input type="file" accept="image/*" ref={fileInputRef} onChange={onFileSelect} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={streaming}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-discord-input text-discord-muted transition hover:bg-discord-border hover:text-discord-text active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          title="画像を添付"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            onInputChange(e.target.value);
            adjustTextarea();
          }}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          placeholder={`${aiName} にメッセージを送信`}
          rows={1}
          className="flex-1 resize-none overflow-hidden rounded-xl border border-discord-border bg-discord-input px-3 py-2.5 text-base text-discord-text placeholder-discord-muted outline-none transition focus:border-discord-text focus:ring-1 focus:ring-discord-text/30 sm:rounded-2xl sm:px-5 sm:text-sm"
        />
        {streaming ? (
          <button
            onClick={onInterrupt}
            className="shrink-0 rounded-2xl bg-red-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 active:scale-95 sm:rounded-3xl sm:px-5"
          >
            <Square size={14} className="inline fill-current" /> 停止
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim() && !imagePreview}
            className="shrink-0 rounded-xl bg-discord-accent px-3 py-2.5 text-sm font-medium text-discord-sidebar transition hover:bg-discord-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-2xl sm:px-5"
          >
            送信
          </button>
        )}
      </div>
    </footer>
  );
}
