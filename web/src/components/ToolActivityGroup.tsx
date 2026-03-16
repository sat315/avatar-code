import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ToolActivityCard, type ToolActivity } from "./ToolActivityCard";

/** ツール名からグループキーを取得 */
function groupKey(toolName: string): string {
  const n = toolName.toLowerCase();
  if (n.includes("read")) return "Read";
  if (n.includes("edit")) return "Edit";
  if (n.includes("write")) return "Write";
  if (n.includes("bash")) return "Bash";
  if (n.includes("grep")) return "Grep";
  if (n.includes("glob")) return "Glob";
  if (n.includes("agent")) return "Agent";
  return toolName;
}

/** グルーピングされたツール表示（同種ツールをまとめて表示） */
function GroupedToolRow({ label, activities }: { label: string; activities: ToolActivity[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-discord-border bg-transparent px-3 py-1.5 text-xs transition hover:bg-discord-sidebar/50"
      >
        <span className="font-mono font-semibold text-discord-text">{label}</span>
        <span className="text-discord-muted">×{activities.length}</span>
        <span className="flex-1" />
        {/* 全部完了なら緑チェック、実行中があれば青パルス */}
        {activities.every((a) => a.status === "done") ? (
          <span className="text-[10px] text-green-500">完了</span>
        ) : (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
        )}
        <span className={`text-discord-muted transition-transform ${open ? "rotate-90" : ""}`}>
          <ChevronRight size={14} />
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-2">
          {activities.map((activity) => (
            <ToolActivityCard key={activity.toolUseId} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ToolActivityGroupProps {
  activities: ToolActivity[];
  onApprove: (toolUseId: string) => void;
  onReject: (toolUseId: string) => void;
}

/** ツールアクティビティをグルーピングして表示 */
export function ToolActivityGroup({ activities, onApprove, onReject }: ToolActivityGroupProps) {
  // 承認待ちとそれ以外を分離
  const pending = activities.filter((a) => a.status === "pending_approval");
  const others = activities.filter((a) => a.status !== "pending_approval");

  // 承認待ち以外をツール名でグルーピング（出現順を維持）
  const groups: { key: string; items: ToolActivity[] }[] = [];
  const groupMap = new Map<string, ToolActivity[]>();
  for (const a of others) {
    const key = groupKey(a.toolName);
    if (!groupMap.has(key)) {
      const items: ToolActivity[] = [];
      groupMap.set(key, items);
      groups.push({ key, items });
    }
    groupMap.get(key)!.push(a);
  }

  return (
    <div className="mb-2 space-y-1">
      {/* グルーピング表示（2つ以上ならまとめる、1つなら通常カード） */}
      {groups.map((g) =>
        g.items.length >= 2 ? (
          <GroupedToolRow key={g.key} label={g.key} activities={g.items} />
        ) : (
          <ToolActivityCard key={g.items[0].toolUseId} activity={g.items[0]} />
        )
      )}

      {/* 承認待ちは単独表示 */}
      {pending.map((activity) => (
        <ToolActivityCard
          key={activity.toolUseId}
          activity={activity}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
}
