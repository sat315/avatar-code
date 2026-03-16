import { useState, useEffect } from "react";

/** thinking折りたたみ表示コンポーネント */
export function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
  const [open, setOpen] = useState(isStreaming);

  // ストリーミング中は自動で開く
  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 transition"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {isStreaming ? (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-purple-400" />
            考え中...
          </span>
        ) : (
          "思考プロセス"
        )}
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}
