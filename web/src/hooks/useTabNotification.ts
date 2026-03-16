/**
 * タブ通知フック
 *
 * タブが非アクティブなときに、承認待ちや接続切れをタイトル点滅＋ファビコン変更で通知する。
 * - "approval" : ツール承認待ち（解決されるまで通知を継続）
 * - "disconnected" : ブリッジ接続切れ（タブフォーカス時に自動停止）
 */
import { useEffect, useRef, useCallback } from "react";

export type TabNotificationType = "approval" | "disconnected";

const FAVICON_SELECTOR = "link[rel='icon']";
const ORIGINAL_FAVICON = "/icons/icon-192.png";

/** 通知タイプごとの設定 */
const NOTIFICATION_CONFIG: Record<TabNotificationType, { emoji: string; label: string }> = {
  approval:     { emoji: "🔔", label: "承認待ち" },
  disconnected: { emoji: "⚠️", label: "接続が切れました" },
};

export function useTabNotification() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitleRef = useRef(document.title);
  const currentTypeRef = useRef<TabNotificationType | null>(null);

  /** Canvas でファビコンを絵文字に差し替える */
  const setEmojiFavicon = useCallback((emoji: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "26px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 16, 18);

    const link =
      document.querySelector<HTMLLinkElement>(FAVICON_SELECTOR) ??
      (() => {
        const el = document.createElement("link");
        el.rel = "icon";
        document.head.appendChild(el);
        return el;
      })();
    link.href = canvas.toDataURL();
  }, []);

  const resetFavicon = useCallback(() => {
    const link = document.querySelector<HTMLLinkElement>(FAVICON_SELECTOR);
    if (!link) return;
    // PWAアイコンが設定されていればそちらを優先、なければデフォルトに戻す
    const pwaIconUrl = localStorage.getItem("pwaIconUrl");
    link.href = pwaIconUrl || ORIGINAL_FAVICON;
  }, []);

  /** 通知を止めてタイトル・ファビコンを元に戻す */
  const stop = useCallback(() => {
    // 通知が出ていない場合は何もしない（faviconを不用意にリセットしない）
    if (!currentTypeRef.current && !intervalRef.current) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    currentTypeRef.current = null;
    document.title = originalTitleRef.current;
    resetFavicon();
  }, [resetFavicon]);

  /** 通知を開始する（同じ種類なら重複しない） */
  const notify = useCallback(
    (type: TabNotificationType) => {
      if (currentTypeRef.current === type) return;

      // 既存インターバルをクリア
      if (intervalRef.current) clearInterval(intervalRef.current);

      // 新規通知開始時のみ元タイトルを保持（タイプ切替時は既存の値を維持）
      if (!currentTypeRef.current) {
        originalTitleRef.current = document.title;
      }
      currentTypeRef.current = type;

      const { emoji, label } = NOTIFICATION_CONFIG[type];
      setEmojiFavicon(emoji);

      let showAlert = true;
      intervalRef.current = setInterval(() => {
        showAlert = !showAlert;
        document.title = showAlert
          ? `${emoji} ${label} — ${originalTitleRef.current}`
          : originalTitleRef.current;
      }, 1000);
    },
    [setEmojiFavicon]
  );

  // タブフォーカス時: disconnected 通知は自動停止（approval は解決まで継続）
  useEffect(() => {
    const onFocus = () => {
      if (currentTypeRef.current === "disconnected") stop();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [stop]);

  // アンマウント時クリーンアップ
  useEffect(() => () => stop(), [stop]);

  return { notify, stop };
}
