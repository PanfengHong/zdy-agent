/**
 * 本地 Mock 的 OpenAI 兼容服务，仅用于离线自测：
 * - /v1/embeddings  用字符 bigram 哈希生成确定性向量（不具语义能力，只验证链路）
 * - /v1/chat/completions  第一轮按问题挑一个工具发起调用，第二轮基于工具结果作答
 *
 * 会根据请求里实际下发的 tools 决定调用哪个工具，因此可以直接验证插件工具是否接通。
 *
 * 用法：node scripts/mock-openai-server.mjs  然后
 *   OPENAI_BASE_URL=http://127.0.0.1:7391/v1 OPENAI_API_KEY=mock EMBEDDING_BASE_URL=... npm run dev
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 7391);
const DIM = 256;
/** 每个流式分片之间的延迟（毫秒），方便观察「生成中 → 已完成」的状态切换 */
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 0);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function embed(text) {
  const vec = new Array(DIM).fill(0);
  const clean = String(text).toLowerCase().replace(/\s+/g, " ");
  for (let i = 0; i < clean.length - 1; i++) {
    const bigram = clean.slice(i, i + 2);
    let h = 0;
    for (let j = 0; j < bigram.length; j++) h = (h * 31 + bigram.charCodeAt(j)) >>> 0;
    vec[h % DIM] += 1;
    vec[(h >> 8) % DIM] += 0.5;
  }
  return vec;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function chunk(delta, finish = null) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-model",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

/** 按问题内容挑一个本轮要调用的工具，返回 null 表示直接作答 */
function planToolCall(text, toolNames) {
  const has = (n) => toolNames.includes(n);
  const q = String(text || "");

  if (has("calculate") && /算|计算|等于|\d\s*[+\-*/^]\s*\d/.test(q)) {
    const expr = (q.match(/[0-9][0-9\s+\-*/().%^]*[0-9)]/) || [])[0];
    return { name: "calculate", args: { expression: expr || "1+1" } };
  }
  if (has("current_datetime") && /几点|几号|日期|星期|时间|多久|天前|天后/.test(q)) {
    return { name: "current_datetime", args: { detail: "full" } };
  }
  if (has("search_knowledge_base")) {
    return { name: "search_knowledge_base", args: { query: q } };
  }
  return null;
}

const server = createServer(async (req, res) => {
  if (req.url?.endsWith("/embeddings")) {
    const body = await readJson(req);
    const input = Array.isArray(body.input) ? body.input : [body.input];
    const data = input.map((text, index) => ({ object: "embedding", index, embedding: embed(text) }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data, model: body.model, usage: { prompt_tokens: 1, total_tokens: 1 } }));
    return;
  }

  if (req.url?.endsWith("/chat/completions")) {
    const body = await readJson(req);
    const messages = body.messages ?? [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const hasToolResult = messages.some((m) => m.role === "tool");
    const toolNames = (body.tools ?? []).map((t) => t.function?.name).filter(Boolean);
    if (process.env.MOCK_DEBUG) console.log("[mock] tools:", JSON.stringify(toolNames));

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });

    if (!hasToolResult) {
      const plan = planToolCall(lastUser?.content, toolNames);

      if (!plan) {
        const answer = `（Mock 模型）收到了：${String(lastUser?.content ?? "").slice(0, 40)}`;
        for (const part of answer.match(/[\s\S]{1,12}/g) ?? []) {
          sse(res, chunk({ content: part }));
          if (DELAY) await wait(DELAY);
        }
        sse(res, chunk({}, "stop"));
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      sse(res, chunk({ role: "assistant", content: "" }));
      sse(res, chunk({ tool_calls: [{ index: 0, id: "call_mock_1", type: "function", function: { name: plan.name, arguments: "" } }] }));
      const args = JSON.stringify(plan.args);
      for (let i = 0; i < args.length; i += 8) {
        sse(res, chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(i, i + 8) } }] }));
      }
      sse(res, chunk({}, "tool_calls"));
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // 第二轮：基于工具结果作答（把工具返回的关键内容回显出来，便于核对）
    const toolMsg = [...messages].reverse().find((m) => m.role === "tool");
    const snippet = String(toolMsg?.content ?? "").slice(0, 220);
    const answer = `（Mock 模型回答）调用工具 ${toolMsg?.name ?? "unknown"} 得到：\n\n${snippet}\n\n以上内容来自工具返回结果 [1]。`;
    for (const part of answer.match(/[\s\S]{1,12}/g) ?? []) {
      sse(res, chunk({ content: part }));
      if (DELAY) await wait(DELAY);
    }
    sse(res, chunk({}, "stop"));
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock openai server on http://127.0.0.1:${PORT}/v1`);
});
