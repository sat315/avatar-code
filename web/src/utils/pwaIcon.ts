import { API_BASE } from "../config";

/**
 * localStorage に保存されたペルソナアイコン設定を favicon / apple-touch-icon / manifest に適用する。
 * 通知用の絵文字ファビコン（data: URL）中は上書きしない。
 */
export function applyPwaIcon() {
  const personaId = localStorage.getItem("pwaPersonaId");
  const iconUrl = localStorage.getItem("pwaIconUrl");
  if (!personaId || !iconUrl) return;

  // 通知用絵文字ファビコン（useTabNotification が設定した data: URL）中は介入しない
  const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (favicon?.href.startsWith("data:")) return;

  if (favicon) favicon.href = iconUrl;

  const touchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (touchIcon) touchIcon.href = iconUrl;

  const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (manifestLink) {
    const workerBase = API_BASE.replace(/\/api$/, "");
    manifestLink.href = `${workerBase}/api/manifest?personaId=${personaId}`;
  }
}
