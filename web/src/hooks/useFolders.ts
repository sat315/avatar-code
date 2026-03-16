import { useState, useCallback } from "react";
import type { Folder } from "../types/chat";
import { API_BASE, authHeaders, authHeadersNoBody } from "../config";

/** localStorage key: 選択中フォルダID */
const STORAGE_KEY = "selectedFolderId";

/**
 * フォルダ管理カスタムフック
 * フォルダ一覧の取得・追加・削除・選択をまとめて管理する
 */
export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolderState] = useState<Folder | null>(null);
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);

  /** ブリッジのプロジェクト一覧とDB同期し、フォルダ一覧を返す */
  const syncFoldersFromBridge = useCallback(async (): Promise<Folder[]> => {
    const foldersRes = await fetch(`${API_BASE}/folders`, {
      headers: authHeadersNoBody(),
    });
    const foldersData = (await foldersRes.json()) as { folders?: Folder[] };
    let dbFolders = foldersData.folders || [];

    try {
      const projectsRes = await fetch(`${API_BASE}/chat/projects`, {
        headers: authHeadersNoBody(),
      });
      if (projectsRes.ok) {
        const projectsData = (await projectsRes.json()) as { projects?: string[] };
        if (projectsData.projects) {
          const existingPaths = new Set(dbFolders.map((f) => f.path));
          const newProjects = projectsData.projects.filter(
            (name) => !existingPaths.has(name)
          );
          for (const name of newProjects) {
            try {
              const addRes = await fetch(`${API_BASE}/folders`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ name, path: name }),
              });
              if (addRes.ok) {
                const added = (await addRes.json()) as { folder: Folder };
                dbFolders = [...dbFolders, added.folder];
              }
            } catch { /* 個別失敗は無視 */ }
          }
        }
      }
    } catch { /* ブリッジオフラインはスキップ */ }

    setFolders(dbFolders);
    return dbFolders;
  }, []);

  /** フォルダ選択。localStorageにも保存。nullの場合はlocalStorageから削除。 */
  const selectFolder = useCallback((folder: Folder | null) => {
    setSelectedFolderState(folder);
    if (folder) {
      localStorage.setItem(STORAGE_KEY, folder.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  /** フォルダ追加API呼び出し + state更新 */
  const addFolder = useCallback(async (name: string, path: string) => {
    try {
      const res = await fetch(`${API_BASE}/folders`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, path }),
      });
      if (res.ok) {
        const data = (await res.json()) as { folder: Folder };
        setFolders((prev) => [...prev, data.folder]);
        // 追加したフォルダを自動選択
        selectFolder(data.folder);
        setShowAddFolderModal(false);
      }
    } catch (e) {
      console.warn("フォルダ追加失敗:", e);
    }
  }, [selectFolder]);

  /** フォルダ削除API呼び出し + state更新。削除したのが選択中なら選択解除。 */
  const deleteFolder = useCallback(async (folderId: string) => {
    try {
      const res = await fetch(`${API_BASE}/folders/${folderId}`, {
        method: "DELETE",
        headers: authHeadersNoBody(),
      });
      if (res.ok) {
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        // 削除したフォルダが選択中だったらクリア
        setSelectedFolderState((current) => {
          if (current?.id === folderId) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
          }
          return current;
        });
      }
    } catch (e) {
      console.warn("フォルダ削除失敗:", e);
    }
  }, []);

  /** localStorageから保存済みフォルダIDを復元 */
  const restoreSavedFolder = useCallback((folderList: Folder[]): Folder | null => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return null;

    const found = folderList.find((f) => f.id === savedId) || null;
    if (found) {
      setSelectedFolderState(found);
    }
    return found;
  }, []);

  return {
    folders,
    selectedFolder,
    showAddFolderModal,
    setShowAddFolderModal,
    syncFoldersFromBridge,
    selectFolder,
    addFolder,
    deleteFolder,
    restoreSavedFolder,
  } as const;
}
