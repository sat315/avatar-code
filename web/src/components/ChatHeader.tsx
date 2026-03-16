import type { Folder, BridgeStatus } from "../types/chat";
import { FolderOpen, GitCompareArrows, Sun, Moon } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

interface ChatHeaderProps {
  aiName: string;
  avatarUrl: string | null;
  statusText: string;
  statusColorClass: string;
  selectedFolder: Folder | null;
  sessionTitle: string | null;
  permissionMode: string;
  wsSessionId: string | null;
  bridgeStatus: BridgeStatus;
  onOpenSidebar: () => void;
  onNavigateHome: () => void;
  onNavigateWardrobe: () => void;
  onOpenDiff: () => void;
  onPermissionModeChange: (mode: string) => void;
}

/** チャット画面のヘッダー（AI名・ステータス・権限モード・Diffボタン） */
export function ChatHeader({
  aiName,
  avatarUrl,
  statusText,
  statusColorClass,
  selectedFolder,
  sessionTitle,
  permissionMode,
  wsSessionId,
  bridgeStatus,
  onOpenSidebar,
  onNavigateHome,
  onNavigateWardrobe,
  onOpenDiff,
  onPermissionModeChange,
}: ChatHeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center gap-2 border-b border-discord-border bg-discord-sidebar px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
      {/* ハンバーガーメニュー（モバイル用） */}
      <button
        onClick={onOpenSidebar}
        className="flex h-10 w-10 items-center justify-center rounded-md text-discord-muted transition hover:bg-discord-input hover:text-discord-text sm:hidden"
        title="メニュー"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button
        onClick={onNavigateHome}
        className="flex h-10 w-10 items-center justify-center rounded-md text-discord-muted transition hover:bg-discord-input hover:text-discord-text sm:h-8 sm:w-8"
        title="ホームに戻る"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={onNavigateWardrobe}
        className="shrink-0 rounded-full transition hover:opacity-80 hover:ring-2 hover:ring-discord-accent"
        title="ワードローブ"
      >
        <img
          src={avatarUrl || undefined}
          alt={aiName}
          className={`h-10 w-10 rounded-full object-cover sm:h-12 sm:w-12 ${!avatarUrl ? "hidden" : ""}`}
        />
        {!avatarUrl && (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-discord-text text-sm font-bold text-stone-100 sm:h-12 sm:w-12 sm:text-base">
            {aiName.charAt(0).toUpperCase()}
          </div>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-discord-text sm:text-base">{aiName}</h1>
        <div className="flex items-center gap-2">
          <p className={`shrink-0 text-xs ${statusColorClass}`}>{statusText}</p>
          {selectedFolder && (
            <span className="truncate text-[11px] text-discord-muted">
              <FolderOpen size={12} className="inline" /> {selectedFolder.name}
              {sessionTitle && <span className="text-discord-muted/60"> / {sessionTitle}</span>}
            </span>
          )}
        </div>
      </div>
      {/* 権限モード + テーマトグル */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
          className="rounded-lg border border-discord-border bg-discord-input p-1.5 text-discord-muted transition hover:bg-discord-card hover:text-discord-text"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={onOpenDiff}
          disabled={bridgeStatus !== "online"}
          title="変更差分を表示"
          className="rounded-lg border border-discord-border bg-discord-input p-1.5 text-discord-muted transition hover:bg-discord-card hover:text-discord-text disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GitCompareArrows size={16} />
        </button>
        <select
          value={permissionMode}
          onChange={(e) => onPermissionModeChange(e.target.value)}
          disabled={!!wsSessionId}
          title={wsSessionId ? "セッション中は変更できません" : "権限モード"}
          className="max-w-[90px] rounded-lg border border-discord-border bg-discord-input px-1.5 py-1 text-[11px] text-discord-text outline-none transition focus:border-discord-accent disabled:opacity-50 disabled:cursor-not-allowed sm:max-w-[120px] sm:px-2 sm:text-xs"
        >
          <option value="default">要承認</option>
          <option value="acceptEdits">編集許可</option>
          <option value="bypassPermissions">全許可</option>
          <option value="plan">プラン</option>
        </select>
      </div>
    </header>
  );
}
