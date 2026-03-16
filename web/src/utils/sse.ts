/**
 * SSE（Server-Sent Events）ストリーミングレスポンスのパーサー
 *
 * ブリッジサーバー形式とClaude API形式の両方に対応。
 */

/** Claude SSEイベントの content_block_delta 型 */
interface ContentBlockDelta {
  type: "content_block_delta";
  index: number;
  delta: {
    type: "text_delta";
    text: string;
  };
}

/** Claude SSEイベントの error 型 */
interface ErrorEvent {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

/** パースされたSSEデータの共用型 */
type SSEData = ContentBlockDelta | ErrorEvent | { type: string };

/**
 * ブリッジサーバー形式のSSEストリームをパースし、テキストをコールバックに渡す
 *
 * ブリッジSSE形式:
 *   event: text
 *   data: {"text": "こんにちは"}
 *
 *   event: done
 *   data: {}
 *
 *   event: error
 *   data: {"message": "エラーメッセージ"}
 *
 * @param reader - ReadableStreamのリーダー
 * @param onText - テキストチャンクを受け取るコールバック
 * @throws ブリッジからエラーイベントを受信した場合
 */
export async function parseBridgeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onText: (text: string) => void
): Promise<void> {
  const decoder = new TextDecoder();
  // SSEはイベント境界が複数チャンクにまたがる可能性があるためバッファリングする
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSEイベントは空行（\n\n）で区切られる
      const events = buffer.split("\n\n");
      // 最後の要素は不完全なイベントの可能性があるためバッファに残す
      buffer = events.pop() || "";

      for (const event of events) {
        if (!event.trim()) continue;

        const lines = event.split("\n");
        let eventType = "";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice("event: ".length).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice("data: ".length);
          }
        }

        if (!dataStr) continue;

        // doneイベントはストリーム完了を示す
        if (eventType === "done") {
          return;
        }

        // エラーイベントの処理
        if (eventType === "error") {
          let errorMsg = "ブリッジサーバーエラー";
          try {
            const parsed = JSON.parse(dataStr) as { message?: string; error?: string };
            if (parsed.message) errorMsg = parsed.message;
            else if (parsed.error) errorMsg = parsed.error;
          } catch {
            // JSONパース失敗時はデフォルトエラーメッセージを使う
          }
          throw new Error(errorMsg);
        }

        // テキストイベントの処理
        if (eventType === "text") {
          try {
            const parsed = JSON.parse(dataStr) as { text?: string };
            if (parsed.text) {
              onText(parsed.text);
            }
          } catch {
            console.warn("ブリッジSSEデータのJSONパースに失敗:", dataStr);
          }
        }
      }
    }

    // バッファに残ったデータを処理
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      let eventType = "";
      let dataStr = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice("event: ".length).trim();
        } else if (line.startsWith("data: ")) {
          dataStr = line.slice("data: ".length);
        }
      }

      if (eventType === "text" && dataStr) {
        try {
          const parsed = JSON.parse(dataStr) as { text?: string };
          if (parsed.text) {
            onText(parsed.text);
          }
        } catch {
          console.warn("ブリッジSSE最終バッファのパースに失敗:", dataStr);
        }
      }
    }
  } finally {
    // リーダーを確実に解放する
    reader.releaseLock();
  }
}

/**
 * Claude API形式のSSEストリームをパースし、テキストデルタをコールバックに渡す
 *
 * @param reader - ReadableStreamのリーダー
 * @param onText - テキストチャンクを受け取るコールバック
 * @throws APIからエラーイベントを受信した場合
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onText: (text: string) => void
): Promise<void> {
  const decoder = new TextDecoder();
  // SSEはイベント境界が複数チャンクにまたがる可能性があるためバッファリングする
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSEイベントは空行（\n\n）で区切られる
      const events = buffer.split("\n\n");
      // 最後の要素は不完全なイベントの可能性があるためバッファに残す
      buffer = events.pop() || "";

      for (const event of events) {
        if (!event.trim()) continue;

        // data行を抽出する（event行やコメント行はスキップ）
        const dataLine = event
          .split("\n")
          .find((line) => line.startsWith("data: "));

        if (!dataLine) continue;

        const jsonStr = dataLine.slice("data: ".length);

        // SSEの接続維持用コメントやpingをスキップ
        if (!jsonStr.trim() || jsonStr.trim() === "[DONE]") continue;

        let parsed: SSEData;
        try {
          parsed = JSON.parse(jsonStr) as SSEData;
        } catch {
          // JSONパースに失敗した行はスキップ（不正なデータの場合）
          console.warn("SSEデータのJSONパースに失敗:", jsonStr);
          continue;
        }

        // エラーイベントの処理
        if (parsed.type === "error") {
          const errorData = parsed as ErrorEvent;
          throw new Error(
            `Claude API エラー: ${errorData.error.type} - ${errorData.error.message}`
          );
        }

        // テキストデルタの抽出
        if (parsed.type === "content_block_delta") {
          const delta = parsed as ContentBlockDelta;
          if (delta.delta?.type === "text_delta" && delta.delta.text) {
            onText(delta.delta.text);
          }
        }
        // message_start, content_block_start, content_block_stop,
        // message_delta, message_stop などは無視する
      }
    }

    // バッファに残ったデータを処理
    if (buffer.trim()) {
      const dataLine = buffer
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (dataLine) {
        const jsonStr = dataLine.slice("data: ".length);
        if (jsonStr.trim() && jsonStr.trim() !== "[DONE]") {
          try {
            const parsed = JSON.parse(jsonStr) as SSEData;
            if (parsed.type === "content_block_delta") {
              const delta = parsed as ContentBlockDelta;
              if (delta.delta?.type === "text_delta" && delta.delta.text) {
                onText(delta.delta.text);
              }
            }
          } catch {
            // 最終バッファのパース失敗は警告のみ
            console.warn("SSE最終バッファのパースに失敗:", jsonStr);
          }
        }
      }
    }
  } finally {
    // リーダーを確実に解放する
    reader.releaseLock();
  }
}
