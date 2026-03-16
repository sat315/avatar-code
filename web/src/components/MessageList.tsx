import { useState } from "react";
import type { Message, MessageUsage } from "../types/chat";
import { Markdown } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolActivityGroup } from "./ToolActivityGroup";
import { MessageMenu } from "./MessageMenu";
import { API_BASE, authHeaders } from "../config";

interface MessageListProps {
  messages: Message[];
  streaming: boolean;
  aiName: string;
  avatarUrl: string | null;
  personaId: number | null;
  loadingOlder: boolean;
  mainRef: React.RefObject<HTMLElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  aiContentRef: React.RefObject<string>;
  onApprove: (toolUseId: string) => void;
  onReject: (toolUseId: string) => void;
  resolveImageUrl: (url: string) => string;
  onOpenRewind?: (msg: Message) => void;
  onRegenerateImage?: (msg: Message, imageIndex: number) => Promise<void>;
}

/** トークン使用量バッジ（コストはMaxプランのため非表示、データは裏で保持） */
function UsageBadge({ usage }: { usage: MessageUsage }) {
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const durationStr = usage.durationMs < 1000
    ? `${usage.durationMs}ms`
    : `${(usage.durationMs / 1000).toFixed(1)}s`;
  const tokensStr = totalTokens >= 1000
    ? `${(totalTokens / 1000).toFixed(1)}k tok`
    : `${totalTokens} tok`;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-discord-border/40 pt-1.5 text-[10px] text-discord-muted">
      <span title={`入力: ${usage.inputTokens.toLocaleString()} / 出力: ${usage.outputTokens.toLocaleString()} / キャッシュ読: ${usage.cacheReadTokens.toLocaleString()} / キャッシュ書: ${usage.cacheWriteTokens.toLocaleString()}`}>
        📊 {tokensStr}
      </span>
      <span title="処理時間">⏱ {durationStr}</span>
      {usage.numTurns > 1 && (
        <span title="ターン数">🔄 {usage.numTurns} turns</span>
      )}
    </div>
  );
}

/** AIアバター（画像があれば表示、なければ頭文字アイコン） */
function AvatarIcon({ name, isAi, avatarUrl }: { name: string; isAi: boolean; avatarUrl: string | null }) {
  if (isAi && avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-10 w-10 shrink-0 rounded-full object-cover sm:h-12 sm:w-12"
      />
    );
  }
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white sm:h-12 sm:w-12 sm:text-base ${
        isAi ? "bg-discord-accent" : "bg-discord-green"
      }`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** 生成画像の「再生成」ボタン */
function RegenerateButton({ onRegenerate }: { onRegenerate: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onRegenerate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-discord-muted hover:bg-discord-hover hover:text-discord-text transition-colors disabled:opacity-40"
      title="この画像を再生成"
    >
      {loading ? (
        <><div className="h-3 w-3 animate-spin rounded-full border-2 border-discord-accent border-t-transparent" /> 生成中…</>
      ) : (
        <>🔄 再生成</>
      )}
    </button>
  );
}

/** 自撮り画像の「ワードローブに追加」ボタン */
function AddToWardrobeButton({ imageUrl, personaId }: { imageUrl: string; personaId: number | null }) {
  const [phase, setPhase] = useState<"idle" | "input" | "saving" | "done" | "error">("idle");
  const [label, setLabel] = useState("");

  const handleSave = async () => {
    if (!personaId || !label.trim()) return;
    setPhase("saving");
    try {
      // /upload/ パスなら API_BASE に変換（chat.tsx の resolveImageUrl と同じロジック）
      const storedUrl = imageUrl.startsWith("http")
        ? (() => {
            try {
              const path = new URL(imageUrl).pathname; // "/api/upload/selfie/xxx.png"
              return path.replace(/^\/api/, ""); // "/upload/selfie/xxx.png"
            } catch {
              return imageUrl;
            }
          })()
        : imageUrl;

      const res = await fetch(`${API_BASE}/costumes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ personaId, label: label.trim(), imageUrl: storedUrl }),
      });
      if (!res.ok) throw new Error("save failed");
      setPhase("done");
    } catch {
      setPhase("error");
    }
  };

  if (phase === "done") {
    return <p className="mt-1 text-xs text-discord-green">✅ ワードローブに追加したよ！</p>;
  }
  if (phase === "error") {
    return <p className="mt-1 text-xs text-red-400">⚠️ 保存に失敗しました</p>;
  }
  if (phase === "input" || phase === "saving") {
    return (
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          className="flex-1 rounded-md border border-discord-border bg-discord-input px-2 py-1 text-xs text-discord-text placeholder:text-discord-muted focus:outline-none focus:ring-1 focus:ring-discord-accent"
          placeholder="衣装名を入力（例: ナース服）"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
          disabled={phase === "saving"}
          maxLength={100}
        />
        <button
          onClick={handleSave}
          disabled={phase === "saving" || !label.trim()}
          className="rounded-md bg-discord-accent px-2 py-1 text-xs font-medium text-white hover:opacity-80 disabled:opacity-40"
        >
          {phase === "saving" ? "保存中…" : "保存"}
        </button>
        <button
          onClick={() => setPhase("idle")}
          disabled={phase === "saving"}
          className="text-xs text-discord-muted hover:text-discord-text"
        >
          キャンセル
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => { setLabel(""); setPhase("input"); }}
      className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-discord-muted hover:bg-discord-hover hover:text-discord-text transition-colors"
    >
      👗 ワードローブに追加
    </button>
  );
}

/** メッセージ一覧（スクロール領域・ツールカード・バブル表示） */
export function MessageList({
  messages,
  streaming,
  aiName,
  avatarUrl,
  personaId,
  loadingOlder,
  mainRef,
  topSentinelRef,
  messagesEndRef,
  aiContentRef,
  onApprove,
  onReject,
  resolveImageUrl,
  onOpenRewind,
  onRegenerateImage,
}: MessageListProps) {
  /** メッセージ内容をレンダリング */
  const renderMessageContent = (msg: Message, isStreaming: boolean) => {
    const cleanContent = msg.content
      .replace(/\[IMG:[^\]]*\]/g, "")
      .replace(/\[IMG:[^\]]*$/g, "")
      .replace(/\[SELFIE:[^\]]*\]/g, "")
      .replace(/\[SELFIE:[^\]]*$/g, "")
      .trim();

    return (
      <>
        {msg.thinking && (
          <ThinkingBlock thinking={msg.thinking} isStreaming={isStreaming && !aiContentRef.current} />
        )}
        {msg.image && (
          <img src={msg.image} alt="添付画像" className="mt-1 max-h-48 rounded-lg" />
        )}
        {msg.imageUrl && (
          <img
            src={resolveImageUrl(msg.imageUrl)}
            alt="添付画像"
            className="mt-1 max-h-48 cursor-pointer rounded-lg"
            onClick={() => window.open(resolveImageUrl(msg.imageUrl!), "_blank")}
          />
        )}
        {(cleanContent || isStreaming) && (
          <div className={isStreaming ? "streaming-cursor" : ""}>
            {msg.role === "ai" ? (
              cleanContent ? <Markdown content={cleanContent} /> : null
            ) : (
              <p className="whitespace-pre-wrap break-words">{cleanContent}</p>
            )}
          </div>
        )}
        {msg.generatedImages?.map((imgUri, idx) => (
          <div key={idx} className="mt-2">
            <img src={imgUri} alt="生成画像" className="max-h-80 rounded-xl shadow-md" />
            <div className="flex flex-wrap items-center gap-1">
              <AddToWardrobeButton imageUrl={imgUri} personaId={personaId} />
              {onRegenerateImage && (
                <RegenerateButton onRegenerate={() => onRegenerateImage(msg, idx)} />
              )}
            </div>
          </div>
        ))}
        {!isStreaming && msg.role === "ai" && msg.pendingImages === true && (
          <div className="mt-2 flex items-center gap-2 text-xs text-discord-muted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-discord-accent border-t-transparent" />
            画像を生成中...
          </div>
        )}
        {!isStreaming && msg.role === "ai" && msg.usage && (
          <UsageBadge usage={msg.usage} />
        )}
      </>
    );
  };

  return (
    <main ref={mainRef} className="mobile-scroll flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4 sm:py-4" style={{ touchAction: "pan-y" }}>
      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <p className="px-4 text-center text-sm text-discord-muted">
            {aiName} にメッセージを送ってみましょう
          </p>
        </div>
      )}

      <div className="mx-auto max-w-3xl divide-y divide-discord-border">
        {/* 上端検知用の番兵要素 */}
        <div ref={topSentinelRef} className="h-1" />
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-discord-accent border-t-transparent" />
          </div>
        )}
        {messages.map((msg, i) => {
          // セッション終了の区切り線
          if (msg.isSeparator) {
            return (
              <div key={`sep-${i}`} className="py-3 flex items-center gap-3 px-4">
                <div className="h-px flex-1 bg-discord-border" />
                <span className="text-xs text-discord-muted">セッション終了</span>
                <div className="h-px flex-1 bg-discord-border" />
              </div>
            );
          }

          const isAi = msg.role === "ai";
          const isStreamingMsg = streaming && isAi && i === messages.length - 1;
          return (
            <div key={`${msg.role}-${i}-${msg.content.slice(0, 20)}`} className="py-3 sm:py-4">
              {/* ツールアクティビティカード（同種ツールをグルーピング） */}
              {isAi && msg.toolActivities && msg.toolActivities.length > 0 && (
                <ToolActivityGroup
                  activities={msg.toolActivities}
                  onApprove={onApprove}
                  onReject={onReject}
                />
              )}

              {/* メッセージバブル */}
              {(msg.content || !isAi || isStreamingMsg) && (
                <div className={`group/msg relative flex items-start gap-2 sm:gap-3 ${isAi ? "" : "flex-row-reverse"}`}>
                  <AvatarIcon name={isAi ? aiName : "You"} isAi={isAi} avatarUrl={avatarUrl} />
                  <div
                    className={`max-w-[85%] min-w-0 overflow-hidden px-3 py-2 text-sm leading-relaxed sm:max-w-[75%] sm:px-4 sm:py-2.5 ${
                      isAi
                        ? "text-discord-text"
                        : "text-discord-text"
                    }`}
                  >
                    {isAi && (
                      <div className="mb-1 flex items-center gap-1">
                        <p className="text-xs font-medium tracking-wide text-discord-muted uppercase">{aiName}</p>
                        {/* 巻き戻しボタン: スマホ常時表示、PCはホバーで表示 */}
                        {onOpenRewind && msg.id != null && !isStreamingMsg && (
                          <div className="sm:opacity-0 sm:transition sm:group-hover/msg:opacity-100">
                            <MessageMenu onRewind={() => onOpenRewind(msg)} />
                          </div>
                        )}
                      </div>
                    )}
                    {isStreamingMsg && !msg.content ? (
                      <span className="streaming-cursor text-discord-muted">作業中</span>
                    ) : (
                      renderMessageContent(msg, isStreamingMsg)
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </main>
  );
}
