import { useState, useRef, useCallback } from "react";

/** FileをBase64 data URIに変換するヘルパー */
const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * 画像アップロード管理カスタムフック
 * クリップボードペースト・ファイル選択・プレビュー表示をまとめて管理する
 */
export function useFileUpload() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** クリップボードから画像ペースト */
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const dataUri = await fileToDataUri(file);
          setImagePreview(dataUri);
        }
        return;
      }
    }
  }, []);

  /** ファイル選択による画像添付処理 */
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const dataUri = await fileToDataUri(file);
      setImagePreview(dataUri);
    }
    // 同じファイルを再選択できるようにリセット
    e.target.value = "";
  }, []);

  /** プレビュークリア */
  const clearPreview = useCallback(() => {
    setImagePreview(null);
  }, []);

  return {
    imagePreview,
    setImagePreview,
    fileInputRef,
    handlePaste,
    handleFileSelect,
    clearPreview,
  } as const;
}
