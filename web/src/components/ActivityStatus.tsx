/** リアルタイムステータスバー（入力欄の上に表示） */
export function ActivityStatus({ status }: { status: string | null }) {
  if (!status) return null;

  return (
    <div className="border-t border-discord-border bg-transparent px-3 py-1.5 sm:px-4">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-discord-accent border-t-transparent" />
        <span className="text-xs text-discord-muted">{status}</span>
      </div>
    </div>
  );
}
