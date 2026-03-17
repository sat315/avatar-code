import { useState, useRef, useCallback } from "react";
import { prepareImage } from "../utils/imageUtils";

/**
 * 画像アップロード管理カスタムフック
 * クリップボードペースト・ファイル選択・プレビュー表示をまとめて管理する
 * 大きな画像は自動的に圧縮してAPIの上限（4.5MB）以内に収める
 */
export function useFileUpload() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
          const { dataUri, error } = await prepareImage(file);
          if (error) {
            setUploadError(error);
          } else {
            setUploadError(null);
            setImagePreview(dataUri);
          }
        }
        return;
      }
    }
  }, []);

  /** ファイル選択による画像添付処理 */
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const { dataUri, error } = await prepareImage(file);
      if (error) {
        setUploadError(error);
      } else {
        setUploadError(null);
        setImagePreview(dataUri);
      }
    }
    // 同じファイルを再選択できるようにリセット
    e.target.value = "";
  }, []);

  /** プレビュークリア */
  const clearPreview = useCallback(() => {
    setImagePreview(null);
    setUploadError(null);
  }, []);

  return {
    imagePreview,
    setImagePreview,
    uploadError,
    fileInputRef,
    handlePaste,
    handleFileSelect,
    clearPreview,
  } as const;
}
