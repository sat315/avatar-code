import { useState, useRef, useEffect } from "react";

interface MessageMenuProps {
  onRewind: () => void;
}

/** メッセージ右上の「⋮」メニュー（巻き戻し操作用） */
export function MessageMenu({ onRewind }: MessageMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      {/* トグルボタン */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1 py-0.5 text-sm text-discord-muted opacity-40 transition hover:bg-discord-input hover:opacity-100"
        aria-label="メッセージメニュー"
      >
        ⋮
      </button>

      {/* ドロップダウンメニュー */}
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[160px] rounded-lg border border-discord-border bg-discord-card py-1 shadow-xl">
          <button
            onClick={() => {
              onRewind();
              setOpen(false);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-discord-text transition hover:bg-discord-input"
          >
            ここまで巻き戻す
          </button>
        </div>
      )}
    </div>
  );
}
