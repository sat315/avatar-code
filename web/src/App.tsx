import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Setup from "./pages/Setup";
import Chat from "./pages/Chat";
import Wardrobe from "./pages/Wardrobe";
import { ThemeProvider } from "./contexts/ThemeContext";
import { API_BASE } from "./config";

/**
 * localStorage に保存されたペルソナアイコン設定を読み込み、
 * favicon / apple-touch-icon / manifest リンクを動的に更新する
 */
function applyPwaIcon() {
  const personaId = localStorage.getItem("pwaPersonaId");
  const iconUrl = localStorage.getItem("pwaIconUrl");
  if (!personaId || !iconUrl) return;

  // favicon
  const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (favicon) favicon.href = iconUrl;

  // apple-touch-icon（iOS ホーム画面追加時に使われる）
  const touchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (touchIcon) touchIcon.href = iconUrl;

  // PWA manifest（Android インストール時に使われる）
  const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (manifestLink) {
    const workerBase = API_BASE.replace(/\/api$/, "");
    manifestLink.href = `${workerBase}/api/manifest?personaId=${personaId}`;
  }
}

function usePwaIcon() {
  const location = useLocation();

  useEffect(() => {
    // ルート変化のたびに再適用（SPA内遷移でfaviconがリセットされる対策）
    applyPwaIcon();

    // bfcache（ブラウザの戻る/進むキャッシュ）から復元された時にも再適用
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) applyPwaIcon();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [location.pathname]);
}

/** ルーティング設定: / → Home, /setup → Setup(新規), /setup/:id → Setup(編集), /chat → Chat, /wardrobe/:personaId → Wardrobe */
export default function App() {
  usePwaIcon();

  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/setup/:id" element={<Setup />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/wardrobe/:personaId" element={<Wardrobe />} />
      </Routes>
    </ThemeProvider>
  );
}
