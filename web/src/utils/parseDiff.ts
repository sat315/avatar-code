/** unified diffパース結果の型 */
export interface DiffFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "delete" | "context";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

/** unified diff文字列をファイルごとにパース */
export function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  // "diff --git" で分割
  const chunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of chunks) {
    const lines = chunk.split("\n");

    // ファイルパス抽出（"a/path b/path" 形式）
    const headerMatch = lines[0]?.match(/a\/(.+?)\s+b\/(.+)/);
    const oldPath = headerMatch?.[1] ?? "unknown";
    const newPath = headerMatch?.[2] ?? "unknown";

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // hunkヘッダー
      const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
      if (hunkMatch) {
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
        oldLine = parseInt(hunkMatch[1], 10);
        newLine = parseInt(hunkMatch[2], 10);
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "add",
          content: line.slice(1),
          newLineNo: newLine++,
        });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "delete",
          content: line.slice(1),
          oldLineNo: oldLine++,
        });
      } else if (line.startsWith(" ")) {
        currentHunk.lines.push({
          type: "context",
          content: line.slice(1),
          oldLineNo: oldLine++,
          newLineNo: newLine++,
        });
      }
      // "\" No newline at end of file 等は無視
    }

    if (hunks.length > 0) {
      files.push({ oldPath, newPath, hunks });
    }
  }

  return files;
}

/** ファイル拡張子から言語名を返す */
export function extToLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", rb: "ruby",
    java: "java", kt: "kotlin", swift: "swift",
    css: "css", scss: "scss", html: "html",
    json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", sql: "sql", sh: "bash",
    toml: "toml", xml: "xml",
  };
  return map[ext] || "text";
}
