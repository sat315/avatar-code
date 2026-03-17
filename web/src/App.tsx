import { useLayoutEffect, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Setup from "./pages/Setup";
import Chat from "./pages/Chat";
import Wardrobe from "./pages/Wardrobe";
import { ThemeProvider } from "./contexts/ThemeContext";
import { applyPwaIcon } from "./utils/pwaIcon";

/**
 * ルート変化のたびに favicon を復元するフック。
 * useLayoutEffect（描画前・同期）と useEffect（描画後・非同期）の両方で適用し、
 * ブラウザのナビゲーション後処理や非同期処理によるリセットをカバーする。
 */
function usePwaIcon() {
  const location = useLocation();

  // 1. 描画前（同期）: ルート変化直後に即時適用
  useLayoutEffect(() => {
    applyPwaIcon();
  }, [location.pathname]);

  // 2. 描画後（非同期）: ブラウザ後処理・WebSocket接続等の非同期リセットに対応
  useEffect(() => {
    applyPwaIcon();
    // ブラウザのナビゲーション後処理後に再適用（50ms）
    const t1 = setTimeout(applyPwaIcon, 50);
    // WebSocket接続完了などの非同期処理後に再適用（300ms）
    const t2 = setTimeout(applyPwaIcon, 300);

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) applyPwaIcon(); // bfcache 復元時
    };
    const handlePopState = () => {
      applyPwaIcon();
      setTimeout(applyPwaIcon, 50);
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
    };
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
