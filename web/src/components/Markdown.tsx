import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";
import { useTheme } from "../contexts/ThemeContext";

function buildCodeTheme(isDark: boolean) {
  const base = isDark ? oneDark : oneLight;
  return {
    ...base,
    'pre[class*="language-"]': {
      ...((base as Record<string, React.CSSProperties>)['pre[class*="language-"]'] ?? {}),
      background: "transparent",
    },
    'code[class*="language-"]': {
      ...((base as Record<string, React.CSSProperties>)['code[class*="language-"]'] ?? {}),
      background: "transparent",
    },
  };
}

/** コードブロックのコピーボタン */
function CopyButton({ text }: { text: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // フォールバック
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded bg-stone-200/60 px-2 py-0.5 text-xs text-stone-500 opacity-0 transition hover:bg-stone-300/60 group-hover:opacity-100"
    >
      コピー
    </button>
  );
}

function makeComponents(codeTheme: ReturnType<typeof buildCodeTheme>): Components {
  return {
    // コードブロック + インラインコード
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeStr = String(children).replace(/\n$/, "");

      // コードブロック（言語指定あり or 複数行）
      if (match || codeStr.includes("\n")) {
        return (
          <div className="group relative my-2 rounded-lg border border-stone-300/50 overflow-hidden">
            {match && (
              <div className="flex items-center justify-between rounded-t-lg border-b border-stone-300/50 px-3 py-1 text-xs text-stone-400">
                {match[1]}
              </div>
            )}
            <CopyButton text={codeStr} />
            <SyntaxHighlighter
              style={codeTheme}
              language={match?.[1] || "text"}
              PreTag="div"
              customStyle={{
                margin: 0,
                background: "transparent",
                borderRadius: match ? "0 0 0.5rem 0.5rem" : "0.5rem",
                fontSize: "0.8rem",
              }}
            >
              {codeStr}
            </SyntaxHighlighter>
          </div>
        );
      }

      // インラインコード
      return (
        <code
          className="rounded px-1 py-0.5 text-[0.85em] text-stone-500 font-mono bg-transparent"
          {...props}
        >
          {children}
        </code>
      );
    },

    // リンク
    a({ href, children }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline hover:text-blue-700"
        >
          {children}
        </a>
      );
    },

    // テーブル
    table({ children }) {
      return (
        <div className="my-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            {children}
          </table>
        </div>
      );
    },
    th({ children }) {
      return (
        <th className="border border-stone-300/50 bg-transparent px-3 py-1.5 text-left font-semibold text-stone-500">
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td className="border border-stone-300/50 bg-transparent px-3 py-1.5">{children}</td>
      );
    },

    // リスト
    ul({ children }) {
      return <ul className="my-1 list-disc pl-5 space-y-0.5">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="my-1 list-decimal pl-5 space-y-0.5">{children}</ol>;
    },

    // 見出し
    h1({ children }) {
      return <h1 className="my-2 text-lg font-bold">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="my-2 text-base font-bold">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="my-1.5 text-sm font-bold">{children}</h3>;
    },

    // 段落
    p({ children }) {
      return <p className="my-1">{children}</p>;
    },

    // 引用
    blockquote({ children }) {
      return (
        <blockquote className="my-2 border-l-3 border-gray-300 pl-3 text-gray-600 italic">
          {children}
        </blockquote>
      );
    },

    // 水平線
    hr() {
      return <hr className="my-3 border-gray-200" />;
    },
  };
}

/** Markdown描画コンポーネント */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const codeTheme = useMemo(() => buildCodeTheme(isDark), [isDark]);
  const components = useMemo(() => makeComponents(codeTheme), [codeTheme]);

  return (
    <div className="markdown-body leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
