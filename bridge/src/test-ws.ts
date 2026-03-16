/**
 * Phase 1 E2Eテスト: ブリッジサーバー WebSocket接続テスト
 *
 * テスト内容:
 * 1. WebSocket接続 → status:connected 受信
 * 2. start → system メッセージ受信
 * 3. 会話（stream_delta / result）受信
 * 4. 切断処理
 *
 * 実行手順:
 * 1. 別ターミナルで `npm run dev` でブリッジ起動
 * 2. `npx tsx src/test-ws.ts` で実行
 */
import WebSocket from "ws";

const BRIDGE_URL = process.env.BRIDGE_URL || "ws://localhost:3456/ws";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

function log(label: string, ...args: unknown[]) {
  const time = new Date().toISOString().slice(11, 23);
  console.log(`[${time}] [${label}]`, ...args);
}

async function runTest() {
  log("TEST", "=== ブリッジ WebSocket E2Eテスト ===");

  // トークン付きURL
  const url = BRIDGE_SECRET ? `${BRIDGE_URL}?token=${BRIDGE_SECRET}` : BRIDGE_URL;
  log("TEST", `Connecting to: ${BRIDGE_URL}`);

  const ws = new WebSocket(url);
  const messages: unknown[] = [];
  let testPhase = "connecting";

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout in phase: ${testPhase}`));
    }, 60_000);

    ws.on("open", () => {
      log("TEST", "✅ WebSocket接続成功");
      testPhase = "connected";
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);

      switch (msg.type) {
        case "status":
          log("RECV", `status: ${msg.status}`);
          if (msg.status === "connected") {
            // テスト1完了 → セッション開始
            testPhase = "starting";
            log("SEND", "start（planモード、初回プロンプト付き）");
            ws.send(JSON.stringify({
              type: "start",
              model: "claude-sonnet-4-6",
              permissionMode: "plan",
              initialPrompt: "「こんにちは」とだけ返してください。ツールは使わないでください。",
            }));
          }
          break;

        case "system":
          log("RECV", `system: subtype=${msg.subtype}, sessionId=${msg.sessionId}`);
          if (msg.subtype === "init" && testPhase === "starting") {
            testPhase = "chatting";
            log("TEST", "✅ セッション確立、応答待ち...");
          }
          break;

        case "stream_delta":
          // テキストストリーミング（1文字〜数文字ずつ来る）
          process.stdout.write(msg.text);
          break;

        case "thinking_delta":
          log("RECV", `thinking: ${msg.text.slice(0, 80)}...`);
          break;

        case "assistant":
          log("RECV", `assistant: ${JSON.stringify(msg.message).slice(0, 150)}`);
          break;

        case "permission_request":
          log("RECV", `permission_request: tool=${msg.toolName}`);
          // planモードなので来ないはずだが念のため拒否
          ws.send(JSON.stringify({ type: "reject", toolUseId: msg.toolUseId, reason: "test" }));
          break;

        case "tool_result":
          log("RECV", `tool_result: ${msg.toolUseId}`);
          break;

        case "result":
          console.log(); // stream_deltaの改行
          log("RECV", `result: turns=${msg.numTurns}, duration=${msg.durationMs}ms`);
          log("RECV", `result text: ${msg.result.slice(0, 200)}`);

          // テスト完了
          log("TEST", "");
          log("TEST", "=== テスト結果 ===");
          log("TEST", `✅ WebSocket接続: OK`);
          log("TEST", `✅ セッション開始: OK`);
          log("TEST", `✅ ストリーミング応答: OK`);
          log("TEST", `✅ 受信メッセージ数: ${messages.length}`);

          clearTimeout(timeout);
          ws.close();
          resolve();
          break;

        case "error":
          log("RECV", `error: ${msg.message}`);
          break;

        default:
          log("RECV", `${msg.type}: ${JSON.stringify(msg).slice(0, 150)}`);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      log("TEST", `❌ WebSocketエラー: ${err.message}`);
      reject(err);
    });

    ws.on("close", (code, reason) => {
      log("TEST", `WebSocket closed: code=${code}, reason=${reason.toString()}`);
    });
  });
}

runTest()
  .then(() => {
    log("TEST", "🎉 全テスト合格！");
    process.exit(0);
  })
  .catch((err) => {
    log("TEST", `❌ テスト失敗: ${err.message}`);
    process.exit(1);
  });
