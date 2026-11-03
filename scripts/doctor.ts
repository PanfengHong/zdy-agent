/**
 * 配置自检：npm run doctor
 * 依次检查 环境变量 → 对话模型 → 工具调用能力 → 向量化模型 → 本地索引，
 * 每一步都给出明确的结论，而不是让用户对着 401/404 猜。
 */
import fs from "node:fs";
import path from "node:path";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), file));
  } catch {
    /* 文件不存在，跳过 */
  }
}

const RESET = "\u001b[0m";
const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const DIM = "\u001b[2m";

let failures = 0;

function ok(label: string, detail = "") {
  console.log(`${GREEN}✓${RESET} ${label}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
}

function fail(label: string, detail = "") {
  failures += 1;
  console.log(`${RED}✗${RESET} ${label}${detail ? `\n  ${RED}→ ${detail}${RESET}` : ""}`);
}

function warn(label: string, detail = "") {
  console.log(`${YELLOW}!${RESET} ${label}${detail ? `\n  ${YELLOW}→ ${detail}${RESET}` : ""}`);
}

function mask(key: string) {
  if (!key) return "(空)";
  return `${key.slice(0, 4)}****${key.slice(-3)} (长度 ${key.length}${key.includes(".") ? "，含点号" : "，无点号"})`;
}

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

async function probe(label: string, url: string, body: unknown, apiKey: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    return { status: res.status, json, text, ms: Date.now() - started };
  } catch (err) {
    return { status: 0, json: null, text: (err as Error).message, ms: Date.now() - started };
  }
}

function errorMessage(json: any, fallback: string): string {
  if (!json) return fallback;
  return json.error?.message ?? json.message ?? json.msg ?? fallback;
}

async function main() {
  console.log("\n==== AI Agent 配置自检 ====\n");

  // 1. 环境文件
  const envFiles = [".env.local", ".env"].filter((f) => fs.existsSync(path.resolve(process.cwd(), f)));
  if (envFiles.length === 0) {
    fail("没有找到 .env.local 或 .env", "Next.js 不会加载 .env.example，请复制成 .env.local 再填值");
  } else {
    ok("环境文件", envFiles.join(", "));
  }

  const llmKey = env("OPENAI_API_KEY");
  const llmBase = (env("OPENAI_BASE_URL") || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const llmModel = env("CHAT_MODEL") || "deepseek-chat";

  const embBase = (env("EMBEDDING_BASE_URL") || llmBase).replace(/\/+$/, "");
  const embKey = env("EMBEDDING_API_KEY") || llmKey;
  const embModel = env("EMBEDDING_MODEL") || "（未填，运行期按 BASE_URL 自动推断）";

  console.log(`${DIM}对话：${llmBase} · ${llmModel} · ${mask(llmKey)}${RESET}`);
  console.log(`${DIM}向量：${embBase} · ${env("EMBEDDING_MODEL") || "(自动)"} · ${mask(embKey)}${RESET}\n`);

  if (!llmKey || llmKey.startsWith("sk-your-key")) {
    fail("OPENAI_API_KEY 未配置");
  }
  if (!embKey || embKey.startsWith("sk-your-key")) {
    fail("EMBEDDING_API_KEY 未配置（留空时应复用 OPENAI_API_KEY）");
  }

  // 2. 对话模型
  if (llmKey) {
    const r = await probe("chat", `${llmBase}/chat/completions`, {
      model: llmModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 8,
    }, llmKey);

    if (r.status === 200) {
      ok("对话模型可用", `${r.ms}ms`);
    } else if (r.status === 401) {
      fail("对话模型鉴权失败（401）", `${errorMessage(r.json, r.text)}｜密钥可能复制不完整或已过期`);
    } else if (r.status === 404) {
      fail("对话模型或接口地址不存在（404）", `${errorMessage(r.json, r.text)}｜核对 OPENAI_BASE_URL 与 CHAT_MODEL`);
    } else {
      fail(`对话模型调用失败（HTTP ${r.status || "网络错误"}）`, errorMessage(r.json, r.text));
    }

    // 3. 工具调用能力（Agent 依赖）
    if (r.status === 200) {
      const toolProbe = await probe("tools", `${llmBase}/chat/completions`, {
        model: llmModel,
        messages: [{ role: "user", content: "帮我查一下知识库里关于报销流程的内容" }],
        tools: [
          {
            type: "function",
            function: {
              name: "search_knowledge_base",
              description: "在企业知识库中做语义检索",
              parameters: {
                type: "object",
                properties: { query: { type: "string", description: "检索词" } },
                required: ["query"],
              },
            },
          },
        ],
        max_tokens: 100,
      }, llmKey);

      const calls = toolProbe.json?.choices?.[0]?.message?.tool_calls;
      if (toolProbe.status === 200 && Array.isArray(calls) && calls.length > 0) {
        ok("模型支持工具调用（Function Calling）");
      } else if (toolProbe.status === 200) {
        warn("模型没有返回工具调用", "Agent 会退化成纯问答，建议换 glm-4-plus / qwen-plus / deepseek-chat 等支持 tools 的模型");
      } else {
        warn(`工具调用探测失败（HTTP ${toolProbe.status}）`, errorMessage(toolProbe.json, toolProbe.text));
      }
    }
  }

  // 4. 向量化
  if (embKey) {
    const r = await probe("embedding", `${embBase}/embeddings`, { model: env("EMBEDDING_MODEL") || undefined, input: "自检文本" }, embKey);
    const dim = r.json?.data?.[0]?.embedding?.length;

    if (r.status === 200 && dim) {
      ok("向量化模型可用", `维度 ${dim} · ${r.ms}ms`);
    } else if (r.status === 401) {
      fail("向量化鉴权失败（401）", `${errorMessage(r.json, r.text)}｜EMBEDDING_API_KEY 无效`);
    } else if (r.status === 404 || /model/i.test(errorMessage(r.json, ""))) {
      fail("向量化模型不存在", `${errorMessage(r.json, r.text)}｜核对 EMBEDDING_MODEL（智谱用 embedding-3，硅基流动用 BAAI/bge-m3）`);
    } else {
      fail(`向量化调用失败（HTTP ${r.status || "网络错误"}）`, errorMessage(r.json, r.text));
    }
  }

  // 5. 本地索引
  const vectorFile = path.resolve(process.cwd(), env("DATA_DIR") || ".data", "index", "vectors.json");
  if (fs.existsSync(vectorFile)) {
    const data = JSON.parse(fs.readFileSync(vectorFile, "utf8"));
    ok("本地索引", `${data.records?.length ?? 0} 个片段，维度 ${data.dim ?? "?"}`);
  } else {
    warn("本地还没有索引", "上传文档或执行 npm run ingest 后生成");
  }

  console.log("");
  if (failures === 0) {
    console.log(`${GREEN}全部通过，可以 npm run dev 了。${RESET}\n`);
  } else {
    console.log(`${RED}有 ${failures} 项需要修复，按上面的箭头提示改 .env.local 后重跑。${RESET}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
