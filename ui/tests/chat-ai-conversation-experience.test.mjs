import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const chatPage = read("src/app/pages/instance/Chat.tsx");

assert.match(
  chatPage,
  /const chatSuggestions = \[/,
  "Chat empty state should provide one-click starter prompts so a first-time user can start naturally.",
);
assert.match(
  chatPage,
  /Hermes 正在思考/,
  "Chat send flow should keep a concise thinking indicator.",
);
assert.doesNotMatch(
  chatPage,
  /const thinkingSteps = \[/,
  "Chat thinking state should not rotate detailed progress copy under the thinking label.",
);
assert.doesNotMatch(
  chatPage,
  /activeThinkingStep/,
  "Chat UI should not render rolling thinking-step text below the thinking label.",
);
assert.doesNotMatch(
  chatPage,
  /调用 Hermes CLI 生成回复|读取当前档案上下文|整理历史会话与工作区文件|等待模型返回并写入会话历史/,
  "Chat thinking copy should not include detailed rolling progress steps.",
);
assert.match(
  chatPage,
  /optimisticMessages/,
  "Chat should render the user's message immediately while Hermes is still running.",
);
assert.match(
  chatPage,
  /streamAssistantResponse/,
  "Chat should reveal assistant output progressively after Hermes returns a response.",
);
assert.match(
  chatPage,
  /requestAnimationFrame/,
  "Assistant response reveal should use frame-based progressive rendering for a real AI chat feel.",
);
assert.match(
  chatPage,
  /handleStopGeneration/,
  "Chat should provide a stop action while a response is in progress.",
);
assert.match(
  chatPage,
  /conversationEndRef/,
  "Chat should auto-scroll to the newest message during thinking and streaming.",
);
assert.match(
  chatPage,
  /event\.key === "Enter" && !event\.shiftKey/,
  "Composer should submit with Enter while preserving Shift+Enter for multiline prompts.",
);
assert.match(
  chatPage,
  /data-testid="chat-composer-input"/,
  "Composer input should have a stable test id for desktop validation.",
);
assert.match(
  chatPage,
  /data-testid="chat-stop-generation"/,
  "Stop generation button should have a stable test id for desktop validation.",
);

console.log("chat AI conversation experience assertions passed");
