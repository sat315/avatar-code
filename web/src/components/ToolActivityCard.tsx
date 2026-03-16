import { useState, type JSX } from "react";
import { FileText, Pencil, FilePen, Terminal, FolderSearch, Search, Wrench, Check, Clock, ChevronRight, X } from "lucide-react";

/** 文字列を指定文字数でtruncate */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/** diff風に各行の先頭にプレフィックスを付ける */
function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix} ${line}`)
    .join("\n");
}

/** ツール種別ごとに折りたたみ中身をレンダリング */
function renderToolDetail(activity: ToolActivity): JSX.Element {
  const input = (activity.input ?? {}) as Record<string, unknown>;
  const n = activity.toolName.toLowerCase();

  // Edit ツール: diff風表示
  if (n.includes("edit")) {
    const oldStr = truncate(String(input.old_string ?? ""), 500);
    const newStr = truncate(String(input.new_string ?? ""), 500);
    return (
      <div className="space-y-2">
        {input.file_path ? (
          <div className="font-mono text-discord-muted">{String(input.file_path)}</div>
        ) : null}
        {oldStr && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border-l-2 border-red-400/60 bg-red-400/10 px-2 py-1 text-[11px] text-red-700/80">
            {prefixLines(oldStr, "-")}
          </pre>
        )}
        {newStr && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border-l-2 border-green-500/60 bg-green-500/10 px-2 py-1 text-[11px] text-green-700/80">
            {prefixLines(newStr, "+")}
          </pre>
        )}
      </div>
    );
  }

  // Bash ツール: コマンド + 結果
  if (n.includes("bash")) {
    const cmd = String(input.command ?? "");
    const result =
      activity.result != null
        ? truncate(
            typeof activity.result === "string"
              ? activity.result
              : JSON.stringify(activity.result, null, 2) ?? "",
            500
          )
        : null;
    return (
      <div className="space-y-2">
        <pre className="rounded bg-transparent px-2 py-1 font-mono text-[11px] text-discord-text">
          {cmd}
        </pre>
        {result && (
          <>
            <div className="text-[10px] font-semibold text-discord-muted">結果:</div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-discord-muted">
              {result}
            </pre>
          </>
        )}
      </div>
    );
  }

  // Read ツール: ファイルパスのみ
  if (n.includes("read")) {
    return (
      <div className="space-y-1">
        <div className="font-mono text-[11px] text-discord-muted">{String(input.file_path ?? "")}</div>
        <div className="text-[11px] text-discord-muted"><FileText size={12} className="inline" /> 読み取り完了</div>
      </div>
    );
  }

  // Grep ツール: パターン + パス
  if (n.includes("grep")) {
    return (
      <div className="space-y-1">
        <div className="font-mono text-[11px] text-discord-muted">
          パターン: <span className="font-semibold">"{String(input.pattern ?? "")}"</span>
        </div>
        {input.path ? (
          <div className="font-mono text-[11px] text-discord-muted">{String(input.path)}</div>
        ) : null}
        <div className="text-[11px] text-discord-muted"><Search size={12} className="inline" /> 検索完了</div>
      </div>
    );
  }

  // Glob ツール: パターンのみ
  if (n.includes("glob")) {
    return (
      <div className="space-y-1">
        <div className="font-mono text-[11px] text-discord-muted">
          パターン: <span className="font-semibold">{String(input.pattern ?? "")}</span>
        </div>
        <div className="text-[11px] text-discord-muted"><FolderSearch size={12} className="inline" /> 検索完了</div>
      </div>
    );
  }

  // Write ツール: ファイルパスのみ
  if (n.includes("write")) {
    return (
      <div className="space-y-1">
        <div className="font-mono text-[11px] text-discord-muted">{String(input.file_path ?? "")}</div>
        <div className="text-[11px] text-discord-muted"><FilePen size={12} className="inline" /> 書き込み完了</div>
      </div>
    );
  }

  // フォールバック: 従来通りJSON表示
  return (
    <div className="space-y-2">
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-discord-muted">
        {JSON.stringify(input, null, 2)?.slice(0, 1000)}
      </pre>
      {activity.result != null && (
        <>
          <div className="text-[10px] font-semibold text-discord-muted">結果:</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-discord-muted">
            {typeof activity.result === "string"
              ? (activity.result as string).slice(0, 500)
              : JSON.stringify(activity.result, null, 2)?.slice(0, 500)}
          </pre>
        </>
      )}
    </div>
  );
}

/** ツール実行の型定義 */
export interface ToolActivity {
  toolUseId: string;
  toolName: string;
  input: unknown;
  result?: unknown;
  status: "running" | "done" | "pending_approval";
}

/** ツール名からアイコンとラベルを返す */
function toolMeta(name: string): { icon: JSX.Element; label: string; color: string } {
  const n = name.toLowerCase();
  if (n.includes("read")) return { icon: <FileText size={14} />, label: "Read", color: "text-blue-600" };
  if (n.includes("edit")) return { icon: <Pencil size={14} />, label: "Edit", color: "text-green-600" };
  if (n.includes("write")) return { icon: <FilePen size={14} />, label: "Write", color: "text-green-600" };
  if (n.includes("bash")) return { icon: <Terminal size={14} />, label: "Bash", color: "text-amber-600" };
  if (n.includes("glob")) return { icon: <FolderSearch size={14} />, label: "Search", color: "text-purple-600" };
  if (n.includes("grep")) return { icon: <Search size={14} />, label: "Grep", color: "text-purple-600" };
  return { icon: <Wrench size={14} />, label: name, color: "text-gray-600" };
}

/** ツール入力からサマリー文字列を抽出 */
function extractSummary(_toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  if (obj.file_path) return String(obj.file_path).split(/[/\\]/).slice(-2).join("/");
  if (obj.path) return String(obj.path).split(/[/\\]/).slice(-2).join("/");
  if (obj.command) {
    const cmd = String(obj.command);
    return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
  }
  if (obj.pattern) return `"${String(obj.pattern).slice(0, 30)}"`;
  if (obj.glob) return String(obj.glob);
  return "";
}

interface ToolActivityCardProps {
  activity: ToolActivity;
  onApprove?: (toolUseId: string) => void;
  onReject?: (toolUseId: string) => void;
}

export function ToolActivityCard({ activity, onApprove, onReject }: ToolActivityCardProps) {
  const [open, setOpen] = useState(false);
  const meta = toolMeta(activity.toolName);
  const summary = extractSummary(activity.toolName, activity.input);

  return (
    <div className="mx-auto max-w-3xl">
      <div
        className={`rounded-lg border px-3 py-1.5 text-xs transition ${
          activity.status === "pending_approval"
            ? "border-yellow-300/60 bg-yellow-50/30"
            : "border-discord-border bg-transparent"
        }`}
      >
        {/* ヘッダー行 */}
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 text-left"
        >
          <span>{meta.icon}</span>
          <span className={`font-mono font-semibold ${meta.color}`}>{meta.label}</span>
          <span className="flex-1 truncate text-discord-muted">{summary}</span>
          {activity.status === "running" && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          )}
          {activity.status === "done" && (
            <span className="text-green-500"><Check size={14} /></span>
          )}
          {activity.status === "pending_approval" && (
            <span className="text-yellow-600"><Clock size={14} /></span>
          )}
          <span className={`text-discord-muted transition-transform ${open ? "rotate-90" : ""}`}><ChevronRight size={14} /></span>
        </button>

        {/* 折りたたみ中身 */}
        {open && (
          <div className="mt-2 border-t border-discord-border pt-2">
            {renderToolDetail(activity)}
          </div>
        )}

        {/* 承認ボタン */}
        {activity.status === "pending_approval" && onApprove && onReject && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onApprove(activity.toolUseId)}
              className="flex-1 rounded-md bg-green-500 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
            >
              <Check size={14} className="inline" /> 許可
            </button>
            <button
              onClick={() => onReject(activity.toolUseId)}
              className="flex-1 rounded-md bg-red-500 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
            >
              <X size={14} className="inline" /> 拒否
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
