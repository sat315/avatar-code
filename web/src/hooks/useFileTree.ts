import { useState, useCallback, useEffect } from "react";
import { API_BASE, authHeaders, authHeadersNoBody } from "../config";

export interface FileEntry {
  name: string;
  /** ALLOWED_BASE_DIR からの相対パス（例: "my-project/docs/README.md"）*/
  path: string;
  type: "file" | "dir";
  children?: FileEntry[];
}

const DEFAULT_EXTENSIONS = ".md,.txt,.json,.yaml,.yml,.toml";

/**
 * フォルダ内ファイルツリーを取得・管理するフック
 * @param folderPath - DB の folder.path（ALLOWED_BASE_DIR からの相対ディレクトリ名）
 * @param extensions - 取得対象の拡張子カンマ区切り
 */
export function useFileTree(
  folderPath: string | null,
  extensions: string = DEFAULT_EXTENSIONS
) {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ path, extensions });
        const res = await fetch(`${API_BASE}/chat/files?${params}`, {
          headers: authHeadersNoBody(),
        });
        if (!res.ok) throw new Error("取得失敗");
        const data = (await res.json()) as { files?: FileEntry[] };
        setTree(data.files ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "不明なエラー");
        setTree([]);
      } finally {
        setLoading(false);
      }
    },
    [extensions]
  );

  useEffect(() => {
    if (folderPath) {
      void fetchTree(folderPath);
    } else {
      setTree([]);
      setError(null);
    }
  }, [folderPath, fetchTree]);

  /** ファイル内容をブリッジ経由で取得 */
  const readFile = useCallback(async (filePath: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `${API_BASE}/chat/file-content?path=${encodeURIComponent(filePath)}`,
        { headers: authHeadersNoBody() }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: string };
      return data.content ?? null;
    } catch {
      return null;
    }
  }, []);

  /** ファイル内容をブリッジ経由で保存 */
  const saveFile = useCallback(async (filePath: string, content: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/chat/file-content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ path: filePath, content }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error || "保存に失敗しました");
    }
  }, []);

  const refresh = useCallback(() => {
    if (folderPath) void fetchTree(folderPath);
  }, [folderPath, fetchTree]);

  return { tree, loading, error, refresh, readFile, saveFile };
}
