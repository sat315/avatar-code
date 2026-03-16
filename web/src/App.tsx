import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Setup from "./pages/Setup";
import Chat from "./pages/Chat";
import Wardrobe from "./pages/Wardrobe";
import { ThemeProvider } from "./contexts/ThemeContext";

/** ルーティング設定: / → Home, /setup → Setup(新規), /setup/:id → Setup(編集), /chat → Chat, /wardrobe/:personaId → Wardrobe */
export default function App() {
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
