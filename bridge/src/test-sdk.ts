/**
 * Phase 0-A: Agent SDK 動作検証スクリプト
 *
 * 検証項目:
 * 1. query() でプロンプト送信 → レスポンス受信
 * 2. canUseTool コールバックが発火すること
 * 3. AsyncGenerator パターンでユーザー入力を供給できること
 *
 * 実行: npx tsx bridge/src/test-sdk.ts
 * ※ Claude Code CLI がインストールされている環境で実行すること
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKMessage,
  SDKUserMessage,
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import path from "path";

// Claude Code内からのネスト起動を許可
delete process.env.CLAUDECODE;

// テスト用の作業ディレクトリ（bridgeディレクトリ自体を使用）
const CWD = path.resolve(import.meta.dirname, "..");

// ─── ユーティリティ ───
/** コンソール出力にタイムスタンプを付与 */
function log(label: string, ...args: unknown[]) {
  const time = new Date().toISOString().slice(11, 23);
  console.log(`[${time}] [${label}]`, ...args);
}

// ─── テスト1: シンプルな query() ───
async function testSimpleQuery() {
  log("TEST1", "=== シンプルな query() テスト ===");

  const conversation = query({
    prompt: "「こんにちは」とだけ返してください。ツールは使わないでください。",
    options: {
      cwd: CWD,
      model: "claude-sonnet-4-6",
      // plan モードでツール実行を抑制（安全にテスト）
      permissionMode: "plan",
    },
  });

  for await (const message of conversation) {
    log("TEST1", `type=${message.type}`, JSON.stringify(message).slice(0, 200));
  }

  log("TEST1", "完了！");
}

// ─── テスト2: canUseTool コールバック検証 ───
async function testCanUseTool() {
  log("TEST2", "=== canUseTool コールバック検証 ===");

  let callbackFired = false;

  /** ツール使用許可のコールバック */
  const handleCanUseTool: CanUseTool = async (
    toolName,
    input,
    options
  ): Promise<PermissionResult> => {
    callbackFired = true;
    log("TEST2", `canUseTool 発火！ tool=${toolName}`, JSON.stringify(input).slice(0, 100));

    // テストなので全て許可
    return { behavior: "allow" };
  };

  const conversation = query({
    prompt:
      "Bashツールで `echo hello` を実行してください。他のツールは使わないで。",
    options: {
      cwd: CWD,
      model: "claude-sonnet-4-6",
      permissionMode: "default",
      canUseTool: handleCanUseTool,
    },
  });

  for await (const message of conversation) {
    log("TEST2", `type=${message.type}`, JSON.stringify(message).slice(0, 200));
  }

  log("TEST2", `canUseTool 発火: ${callbackFired ? "OK ✅" : "NG ❌"}`);
}

// ─── テスト3: AsyncGenerator パターンでユーザー入力を供給 ───
async function testStreamingInput() {
  log("TEST3", "=== AsyncGenerator ストリーミング入力テスト ===");

  /**
   * ユーザーメッセージを順番に供給する AsyncGenerator
   * 2ターン分のメッセージを送る
   */
  async function* createUserMessageStream(): AsyncGenerator<SDKUserMessage> {
    // 1ターン目
    log("TEST3", "1ターン目のメッセージを送信");
    yield {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: "あなたの名前を教えてください。ツールは使わないで。",
      },
      parent_tool_use_id: null,
      session_id: "",
    };

    // AIの応答を待つための間（実際にはfor awaitループで応答を消費した後に次がyieldされる）
    // 2ターン目
    log("TEST3", "2ターン目のメッセージを送信");
    yield {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: "ありがとう！これでテスト終了です。",
      },
      parent_tool_use_id: null,
      session_id: "",
    };
  }

  const conversation = query({
    prompt: createUserMessageStream(),
    options: {
      cwd: CWD,
      model: "claude-sonnet-4-6",
      permissionMode: "plan",
    },
  });

  let messageCount = 0;
  for await (const message of conversation) {
    messageCount++;
    log("TEST3", `[msg#${messageCount}] type=${message.type}`, JSON.stringify(message).slice(0, 200));
  }

  log("TEST3", `合計メッセージ数: ${messageCount}`);
  log("TEST3", "完了！");
}

// ─── メイン ───
async function main() {
  log("MAIN", "Phase 0-A: Agent SDK 動作検証 開始");
  log("MAIN", "======================================");

  try {
    // テスト1: シンプルなquery
    await testSimpleQuery();
    console.log();

    // テスト2: canUseTool
    await testCanUseTool();
    console.log();

    // テスト3: ストリーミング入力
    await testStreamingInput();
    console.log();

    log("MAIN", "======================================");
    log("MAIN", "全テスト完了！");
  } catch (error) {
    log("ERROR", "テスト中にエラーが発生:", error);
    process.exit(1);
  }
}

main();
