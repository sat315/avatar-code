import { useState, useEffect } from "react";
import type { Session } from "../types/chat";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { useFileTree } from "../hooks/useFileTree";

/** フォルダの型定義 */
export interface Folder {
  id: string;
  name: string;
  path: string;
  sort_order: number;
}

type SidebarTab = "sessions" | "files";

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (folder: Folder) => void;
  onAddFolder: () => void;
  onDeleteFolder: (folderId: string) => void;
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
}

/** セッション日時を「M/D H:mm」形式にフォーマット */
function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** フォルダ名からアイコン背景色を決定 */
function getIconColor(name: string): string {
  const colors = [
    "bg-discord-accent",
    "bg-discord-green",
    "bg-orange-500",
    "bg-pink-500",
    "bg-purple-500",
    "bg-teal-500",
    "bg-red-500",
    "bg-yellow-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * サイドバーコンポーネント
 * ヘッダーにフォルダ選択ドロップダウン＋セッション/ファイルタブを配置
 */
export function Sidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onAddFolder,
  onDeleteFolder,
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
}: SidebarProps) {
  // ヘッダータブ
  const [activeTab, setActiveTab] = useState<SidebarTab>("sessions");
  // フォルダ選択ドロップダウンの開閉
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  // フォルダ削除確認中のID
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // セッション操作メニュー
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null);
  // セッション名前変更
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  // セッション削除確認
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  // FileViewer
  const [viewerFile, setViewerFile] = useState<{ path: string; name: string } | null>(null);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  // ファイルツリーフック（ファイルタブが選択されたフォルダのパスで取得）
  const { tree, loading: treeLoading, error: treeError, refresh: refreshTree, readFile, saveFile } =
    useFileTree(selectedFolder?.path ?? null);

  // フォルダが切り替わったらドロップダウンを閉じる
  useEffect(() => {
    setFolderPickerOpen(false);
    setConfirmDeleteId(null);
  }, [selectedFolderId]);

  /** セッション選択 */
  const handleSessionClick = (session: Session) => {
    if (session.id === activeSessionId) return;
    onSelectSession(session);
    onClose();
  };

  /** 新しいセッション作成 */
  const handleCreateSession = () => {
    onCreateSession();
    onClose();
  };

  /** 現フォルダのセッション一覧 */
  const currentSessions = sessions.filter((s) => s.folder_id === (selectedFolderId ?? ""));

  const sidebarContent = (
    <div className="flex h-full w-60 flex-col bg-discord-sidebar border-r border-discord-border">

      {/* ===== ヘッダー ===== */}
      <div className="shrink-0 border-b border-discord-border">
        {/* フォルダ選択行 */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* フォルダ選択ドロップダウントリガー */}
          <button
            onClick={() => setFolderPickerOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-discord-input"
          >
            {selectedFolder ? (
              <>
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${getIconColor(selectedFolder.name)}`}
                >
                  {selectedFolder.name.charAt(0).toUpperCase()}
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-discord-text">
                  {selectedFolder.name}
                </span>
              </>
            ) : (
              <>
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-discord-muted/30 text-[10px] text-discord-muted">
                  --
                </div>
                <span className="text-sm text-discord-muted">フォルダ未選択</span>
              </>
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3.5 w-3.5 shrink-0 text-discord-muted transition-transform ${folderPickerOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* モバイル: 閉じるボタン */}
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-discord-muted transition hover:bg-discord-input hover:text-discord-text sm:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* フォルダピッカー（展開時） */}
        {folderPickerOpen && (
          <div className="border-t border-discord-border px-2 pb-2 pt-1">
            {/* フォルダなし */}
            <button
              onClick={() => {
                onSelectFolder({ id: "", name: "", path: "", sort_order: 0 });
                onClose();
              }}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                !selectedFolderId
                  ? "bg-discord-accent/10 text-discord-text"
                  : "text-discord-muted hover:bg-discord-input hover:text-discord-text"
              }`}
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-discord-muted/30 text-[9px] text-discord-muted">
                --
              </div>
              <span className="truncate">フォルダなし</span>
            </button>

            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              const isConfirming = confirmDeleteId === folder.id;

              return (
                <div key={folder.id} className="mb-0.5">
                  {isConfirming ? (
                    <div className="flex items-center gap-1 rounded-lg px-2 py-1.5">
                      <span className="flex-1 truncate text-xs text-red-400">削除する？</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFolder(folder.id);
                          setConfirmDeleteId(null);
                        }}
                        className="rounded bg-red-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-600"
                      >
                        削除
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="rounded bg-discord-input px-2 py-0.5 text-[11px] text-discord-muted hover:bg-discord-border"
                      >
                        戻す
                      </button>
                    </div>
                  ) : (
                    <div className="group/folder flex items-center gap-1">
                      <button
                        onClick={() => {
                          onSelectFolder(folder);
                          setFolderPickerOpen(false);
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                          isSelected
                            ? "bg-discord-accent/10 text-discord-text"
                            : "text-discord-muted hover:bg-discord-input hover:text-discord-text"
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${getIconColor(folder.name)}`}
                        >
                          {folder.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate font-medium">{folder.name}</span>
                      </button>
                      {/* 削除ボタン（ホバー時） */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(folder.id); }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-discord-muted opacity-0 transition hover:bg-red-100 hover:text-red-500 group-hover/folder:opacity-100"
                        title="削除"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* フォルダ追加 */}
            <button
              onClick={() => { onAddFolder(); setFolderPickerOpen(false); }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-discord-muted transition hover:bg-discord-input hover:text-discord-text"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              フォルダを追加
            </button>
          </div>
        )}

        {/* タブバー */}
        <div className="flex border-t border-discord-border">
          <button
            onClick={() => setActiveTab("sessions")}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition ${
              activeTab === "sessions"
                ? "border-b-2 border-discord-accent text-discord-text"
                : "text-discord-muted hover:text-discord-text"
            }`}
          >
            💬 セッション
          </button>
          <button
            onClick={() => { setActiveTab("files"); if (selectedFolder) refreshTree(); }}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition ${
              activeTab === "files"
                ? "border-b-2 border-discord-accent text-discord-text"
                : "text-discord-muted hover:text-discord-text"
            }`}
          >
            📁 ファイル
          </button>
        </div>
      </div>

      {/* ===== タブコンテンツ ===== */}
      <div className="min-h-0 flex-1 overflow-y-auto">

        {/* セッションタブ */}
        {activeTab === "sessions" && (
          <div className="px-2 py-2">
            {!selectedFolderId ? (
              <p className="px-3 py-4 text-center text-xs text-discord-muted">
                フォルダを選択してね📂
              </p>
            ) : (
              <>
                {/* 新しいセッション作成ボタン */}
                <button
                  onClick={handleCreateSession}
                  className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-discord-muted transition hover:bg-discord-input hover:text-discord-text"
                >
                  <span className="text-sm font-bold">+</span>
                  <span>新しいセッション</span>
                </button>

                {currentSessions.length === 0 ? (
                  <p className="px-3 py-2 text-center text-xs text-discord-muted">
                    セッションがないよ💭
                  </p>
                ) : (
                  currentSessions.map((session) => {
                    const isCurrent = session.id === activeSessionId;
                    const isRenaming = renamingSessionId === session.id;
                    const isConfirmingDelete = confirmDeleteSessionId === session.id;
                    const isMenuOpen = sessionMenuId === session.id;
                    const displayTitle = session.title || formatSessionDate(session.created_at);

                    return (
                      <div key={session.id} className="group/session relative mb-0.5">
                        {isRenaming ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (renameInput.trim()) onRenameSession(session.id, renameInput.trim());
                              setRenamingSessionId(null);
                            }}
                            className="flex items-center gap-1 px-2 py-1"
                          >
                            <input
                              autoFocus
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              onBlur={() => setRenamingSessionId(null)}
                              onKeyDown={(e) => { if (e.key === "Escape") setRenamingSessionId(null); }}
                              className="min-w-0 flex-1 rounded border border-discord-border bg-discord-input px-1.5 py-1 text-xs text-discord-text outline-none focus:border-discord-accent"
                            />
                          </form>
                        ) : isConfirmingDelete ? (
                          <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs">
                            <span className="flex-1 text-red-400">削除する？</span>
                            <button
                              onClick={() => { onDeleteSession(session.id); setConfirmDeleteSessionId(null); }}
                              className="rounded bg-red-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-600"
                            >
                              削除
                            </button>
                            <button
                              onClick={() => setConfirmDeleteSessionId(null)}
                              className="rounded bg-discord-input px-2 py-0.5 text-[11px] text-discord-muted hover:bg-discord-border"
                            >
                              戻す
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSessionClick(session)}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                              isCurrent
                                ? "bg-discord-accent/15 text-discord-text"
                                : "text-discord-muted hover:bg-discord-input hover:text-discord-text"
                            }`}
                          >
                            <span className="shrink-0">💬</span>
                            <span className="min-w-0 flex-1 truncate">{displayTitle}</span>
                            {session.is_active === 1 && (
                              <span className="shrink-0" title="アクティブ">🟢</span>
                            )}
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setSessionMenuId(isMenuOpen ? null : session.id);
                              }}
                              className="shrink-0 rounded px-0.5 text-discord-muted opacity-60 hover:bg-discord-input hover:opacity-100 sm:opacity-0 sm:group-hover/session:opacity-60"
                            >
                              ⋮
                            </span>
                          </button>
                        )}

                        {/* ドロップダウンメニュー */}
                        {isMenuOpen && (
                          <div className="absolute right-0 top-full z-50 mt-0.5 min-w-[120px] rounded-lg border border-discord-border bg-discord-card py-1 shadow-xl">
                            <button
                              onClick={() => {
                                setRenameInput(session.title || "");
                                setRenamingSessionId(session.id);
                                setSessionMenuId(null);
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs text-discord-text hover:bg-discord-input"
                            >
                              名前変更
                            </button>
                            <button
                              onClick={() => {
                                setConfirmDeleteSessionId(session.id);
                                setSessionMenuId(null);
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-discord-input"
                            >
                              削除
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}

        {/* ファイルタブ */}
        {activeTab === "files" && (
          <div>
            {!selectedFolder ? (
              <p className="px-3 py-4 text-center text-xs text-discord-muted">
                フォルダを選択してね📂
              </p>
            ) : treeLoading ? (
              <p className="px-3 py-4 text-center text-xs text-discord-muted">
                読み込み中…
              </p>
            ) : treeError ? (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-red-400">{treeError}</p>
                <button
                  onClick={refreshTree}
                  className="mt-2 text-xs text-discord-accent underline"
                >
                  再試行
                </button>
              </div>
            ) : (
              <FileTree
                entries={tree}
                onOpenFile={(path, name) => setViewerFile({ path, name })}
                selectedPath={viewerFile?.path}
                folderPath={selectedFolder.path}
              />
            )}
          </div>
        )}
      </div>

      {/* FileViewer モーダル */}
      <FileViewer
        filePath={viewerFile?.path ?? null}
        fileName={viewerFile?.name ?? ""}
        onClose={() => setViewerFile(null)}
        readFile={readFile}
        onSave={saveFile}
      />
    </div>
  );

  return (
    <>
      {/* PC: 常時表示 */}
      <div className="hidden sm:block">{sidebarContent}</div>

      {/* モバイル: オーバーレイ */}
      {isOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
