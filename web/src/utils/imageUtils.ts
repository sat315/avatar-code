/**
 * 画像サイズ制限・圧縮ユーティリティ
 * チャット画像・アバター・衣装アップロードで共通利用する
 */

/** Anthropic / Gemini APIの画像上限（base64サイズ）。余裕を持って4.5MBに設定 */
export const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

/** 入力として受け付ける最大ファイルサイズ（10MB）。これを超えたらエラー */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/** FileをBase64 data URIに変換する */
export const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** data URIのバイトサイズを推定する（base64文字数から計算） */
export const estimateDataUriBytes = (dataUri: string): number => {
  const base64 = dataUri.split(",")[1] ?? "";
  return Math.floor(base64.length * 0.75);
};

/**
 * Canvas APIを使って画像を圧縮する
 * MAX_IMAGE_BYTES を下回るまで品質を落としてリトライする
 */
export const compressImage = (dataUri: string, mimeType: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // アスペクト比を維持しながら最大2048pxに縮小
      const MAX_DIM = 2048;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // HEIC/HEIFはJPEGとして出力
      const outputType =
        mimeType === "image/heic" || mimeType === "image/heif" ? "image/jpeg" : mimeType;
      // GIFはロスレス圧縮できないためPNGにフォールバック
      const compressType = outputType === "image/gif" ? "image/png" : outputType;

      // 品質を下げながら MAX_IMAGE_BYTES 以下になるまでリトライ
      let quality = 0.85;
      let result = canvas.toDataURL(compressType, quality);
      while (estimateDataUriBytes(result) > MAX_IMAGE_BYTES && quality > 0.2) {
        quality -= 0.1;
        result = canvas.toDataURL(compressType, quality);
      }
      resolve(result);
    };
    img.src = dataUri;
  });

/**
 * data URI を Blob に変換する（FormData アップロード用）
 */
export const dataUriToBlob = (dataUri: string): Blob => {
  const [header, base64] = dataUri.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
};

/**
 * Fileを受け取り、必要に応じて圧縮した data URI を返す
 * - 10MB超: エラー
 * - 4.5MB超: Canvas圧縮
 * - それ以下: そのままdataURI化
 */
export const prepareImage = async (
  file: File
): Promise<{ dataUri: string; mimeType: string; error?: string }> => {
  if (file.size > MAX_INPUT_BYTES) {
    return { dataUri: "", mimeType: file.type, error: "画像が大きすぎます（上限: 10MB）" };
  }
  const dataUri = await fileToDataUri(file);
  if (estimateDataUriBytes(dataUri) <= MAX_IMAGE_BYTES) {
    return { dataUri, mimeType: file.type };
  }
  const compressed = await compressImage(dataUri, file.type);
  // 圧縮後のMIMEタイプを取得（HEIC→JPEGなどの変換を考慮）
  const compressedMime = compressed.split(",")?.[0].match(/:(.*?);/)?.[1] ?? file.type;
  return { dataUri: compressed, mimeType: compressedMime };
};
