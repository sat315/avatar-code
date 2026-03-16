import React, { useState, useEffect } from "react";
import { X, ChevronDown, ChevronRight, FileCode } from "lucide-react";
import { parseDiff, type DiffFile, type DiffLine } from "../utils/parseDiff";

interface DiffModalProps {
  diff: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

/** diff行の背景色 */
function lineBg(type: DiffLine["type"]): string {
  switch (type) {
    case "add": return "bg-green-50";
    case "delete": return "bg-red-50";
    default: return "";
  }
}

/** diff行のプレフィックス色 */
function prefixColor(type: DiffLine["type"]): string {
  switch (type) {
    case "add": return "text-green-600";
    case "delete": return "text-red-600";
    default: return "text-gray-400";
  }
}

/** 個別ファイルセクション */
function DiffFileSection({ file }: { file: DiffFile }) {
  const [open, setOpen] = useState(true);
  const additions = file.hunks.flatMap(h => h.lines).filter(l => l.type === "add").length;
  const deletions = file.hunks.flatMap(h => h.lines).filter(l => l.type === "delete").length;

  return (
    <div className="border border-discord-border rounded-lg overflow-hidden">
      {/* ファイルヘッダー */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 bg-gray-50 px-3 py-2 text-left text-sm font-mono hover:bg-gray-100 transition"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FileCode size={14} className="text-discord-muted" />
        <span className="flex-1 truncate text-discord-text">{file.newPath}</span>
        {additions > 0 && <span className="text-green-600 text-xs font-semibold">+{additions}</span>}
        {deletions > 0 && <span className="text-red-600 text-xs font-semibold">-{deletions}</span>}
      </button>

      {/* diff内容 */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <tbody>
              {file.hunks.map((hunk, hi) => (
                <React.Fragment key={`hunk-${hi}`}>
                  {/* hunkヘッダー */}
                  <tr className="bg-blue-50">
                    <td colSpan={3} className="px-3 py-1 text-blue-600 text-[11px]">
                      {hunk.header}
                    </td>
                  </tr>
                  {/* diff行 */}
                  {hunk.lines.map((line, li) => (
                    <tr key={`line-${hi}-${li}`} className={lineBg(line.type)}>
                      {/* 行番号 */}
                      <td className="select-none px-2 text-right text-[11px] text-gray-400 w-10">
                        {line.oldLineNo ?? ""}
                      </td>
                      <td className="select-none px-2 text-right text-[11px] text-gray-400 w-10">
                        {line.newLineNo ?? ""}
                      </td>
                      {/* 内容 */}
                      <td className="px-2 whitespace-pre-wrap break-all">
                        <span className={`select-none mr-2 ${prefixColor(line.type)}`}>
                          {line.type === "add" ? "+" : line.type === "delete" ? "-" : " "}
                        </span>
                        {line.content}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DiffModal({ diff, loading, error, onClose }: DiffModalProps) {
  const files = diff ? parseDiff(diff) : [];

  // ESCキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-discord-border px-4 py-3">
          <h2 className="text-sm font-semibold text-discord-text">
            変更差分
            {files.length > 0 && (
              <span className="ml-2 text-xs text-discord-muted font-normal">
                {files.length}ファイル
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-discord-muted hover:bg-gray-100 hover:text-discord-text transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-discord-accent border-t-transparent" />
              <span className="ml-2 text-sm text-discord-muted">diff取得中...</span>
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {!loading && !error && files.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-discord-muted">
              変更なし
            </div>
          )}
          {files.map((file, i) => (
            <DiffFileSection key={`${file.newPath}-${i}`} file={file} />
          ))}
        </div>
      </div>
    </div>
  );
}
