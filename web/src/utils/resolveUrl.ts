import { API_BASE } from "../config";

/** R2パス（/upload/...）をフルAPIのURLに変換 */
export function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/upload")) return `${API_BASE}${url}`;
  return url;
}
