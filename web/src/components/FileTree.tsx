import { useState, useRef, useCallback } from "react";
import type { FileEntry } from "../hooks/useFileTree";

interface FileTreeProps {
  entries: FileEntry[];
  /** ファイルクリック時のコールバック（パスとファイル名を渡す） */
  onOpenFile: (path: string, name: string) => void;
  /** 選択中ファイルのパス */
  selectedPath?: string | null;
  /** プロジェクトの folder.path（コピーパスの先頭を除去するのに使う） */
  folderPath: string;
}

interface FileNodeProps {
  entry: FileEntry;
  depth: number;
  onOpenFile: (path: string, name: string) => void;
  selectedPath?: string | null;
  folderPath: string;
}

/** ファイルアイコンを拡張子で返す */
function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md": return "📄";
    case "json": return "🔧";
    case "yaml":
    case "yml": return "⚙️";
    case "toml": return "⚙️";
    case "txt": return "📝";
    default: return "📄";
  }
}

/** 1ノード（ファイル or ディレクトリ） */
function FileNode({ entry, depth, onOpenFile, selectedPath, folderPath }: FileNodeProps) {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const [copied, setCopied] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSelected = selectedPath === entry.path;

  /** プロジェクトルート相対パスを "@" プレフィックス付きでクリップボードにコピー */
  const copyPath = useCallback(async () => {
    // folderPath を先頭から除いてプロジェクト内相対パスに
    const rel = entry.path.startsWith(folderPath + "/")
      ? entry.path.slice(folderPath.length + 1)
      : entry.path;
    try {
      await navigator.clipboard.writeText(`@${rel}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // フォールバック: 何もしない
    }
  }, [entry.path, folderPath]);

  // ---- 長押し（モバイル Touch / PC Mouse）----
  const startPress = useCallback(() => {
    pressTimer.current = setTimeout(() => {
      void copyPath();
    }, 500);
  }, [copyPath]);

  const cancelPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const indentPx = depth * 12;

  if (entry.type === "dir") {
    return (
      <div>
        <button
          onClick={() => setIsOpen((v) => !v)}
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          style={{ paddingLeft: `${indentPx + 8}px` }}
          className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs text-discord-muted transition hover:bg-discord-input hover:text-discord-text"
        >
          <span className="shrink-0 text-[10px]">{isOpen ? "▼" : "▶"}</span>
          <span className="shrink-0">📁</span>
          <span className="truncate font-medium">{entry.name}</span>
        </button>
        {isOpen && entry.children && (
          <div>
            {entry.children.map((child) => (
              <FileNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                onOpenFile={onOpenFile}
                selectedPath={selectedPath}
                folderPath={folderPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ファイルノード
  return (
    <button
      onClick={() => onOpenFile(entry.path, entry.name)}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      style={{ paddingLeft: `${indentPx + 8}px` }}
      className={`relative flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs transition ${
        isSelected
          ? "bg-discord-accent/15 text-discord-text"
          : "text-discord-muted hover:bg-discord-input hover:text-discord-text"
      }`}
    >
      <span className="shrink-0">{fileIcon(entry.name)}</span>
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      {/* コピー完了バッジ */}
      {copied && (
        <span className="shrink-0 rounded bg-discord-accent/20 px-1.5 py-0.5 text-[10px] text-discord-accent">
          コピー✓
        </span>
      )}
    </button>
  );
}

/** ファイルツリー全体 */
export function FileTree({ entries, onOpenFile, selectedPath, folderPath }: FileTreeProps) {
  if (entries.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-discord-muted">
        ファイルが見つからない📭
      </p>
    );
  }

  return (
    <div className="px-1 py-1">
      {entries.map((entry) => (
        <FileNode
          key={entry.path}
          entry={entry}
          depth={0}
          onOpenFile={onOpenFile}
          selectedPath={selectedPath}
          folderPath={folderPath}
        />
      ))}
    </div>
  );
}
