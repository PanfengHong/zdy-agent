import fs from "node:fs";
import path from "node:path";

/**
 * 统一配置入口。
 * 所有 env 都在「调用时」读取，避免 next build 阶段因缺少 key 而报错。
 */

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return (v ?? fallback).trim();
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function trimmedUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** 各平台默认向量模型：既能"只填 BASE_URL 就跑"，也用于模型名不匹配时给建议 */
const EMBEDDING_PRESETS: Array<{ host: RegExp; model: RegExp; guess: string; name: string }> = [
  { host: /bigmodel\.cn/, model: /^embedding-\d/i, guess: "embedding-3", name: "智谱 GLM" },
  { host: /siliconflow/, model: /bge|bce|gte|jina/i, guess: "BAAI/bge-m3", name: "硅基流动" },
  { host: /dashscope/, model: /^text-embedding-v\d/i, guess: "text-embedding-v3", name: "阿里百炼" },
  {
    host: /api\.openai\.com/,
    model: /^(text-embedding-3|text-embedding-ada)/i,
    guess: "text-embedding-3-small",
    name: "OpenAI",
  },
  { host: /localhost:11434|127\.0\.0\.1:11434/, model: /nomic|bge|qwen/i, guess: "nomic-embed-text", name: "Ollama" },
];

export function guessEmbeddingModel(baseURL: string): string {
  return EMBEDDING_PRESETS.find((p) => p.host.test(baseURL))?.guess ?? "text-embedding-3-small";
}

/** BASE_URL 与模型名是否看起来不属于同一家平台 */
function detectEmbeddingMismatch(baseURL: string, model: string): string | null {
  const preset = EMBEDDING_PRESETS.find((p) => p.host.test(baseURL));
  if (!preset || !model) return null;
  if (preset.model.test(model)) return null;
  return `EMBEDDING_BASE_URL 指向「${preset.name}」，但 EMBEDDING_MODEL="${model}" 不是该平台的模型，建议改为 "${preset.guess}"。`;
}

export function getLlmConfig() {
  return {
    apiKey: str("OPENAI_API_KEY"),
    baseURL: trimmedUrl(str("OPENAI_BASE_URL", "https://api.deepseek.com/v1")),
    model: str("CHAT_MODEL", "deepseek-chat"),
    temperature: Number(process.env.CHAT_TEMPERATURE ?? 0.2),
    maxTokens: num("CHAT_MAX_TOKENS", 2048),
  };
}

export function getEmbeddingConfig() {
  const llm = getLlmConfig();
  const baseURL = trimmedUrl(str("EMBEDDING_BASE_URL") || llm.baseURL);
  return {
    apiKey: str("EMBEDDING_API_KEY") || llm.apiKey,
    baseURL,
    model: str("EMBEDDING_MODEL") || guessEmbeddingModel(baseURL),
  };
}

export function getRagConfig() {
  return {
    chunkSize: num("CHUNK_SIZE", 800),
    chunkOverlap: num("CHUNK_OVERLAP", 120),
    topK: num("RETRIEVAL_TOP_K", 5),
    minScore: Number(process.env.RETRIEVAL_MIN_SCORE ?? 0.25),
    maxContextChars: num("MAX_CONTEXT_CHARS", 6000),
  };
}

export function getPaths() {
  const root = str("DATA_DIR") || path.join(process.cwd(), ".data");
  const index = path.join(root, "index");
  return {
    root,
    index,
    docs: path.join(root, "docs"),
    vectorFile: path.join(index, "vectors.json"),
    registryFile: path.join(index, "documents.json"),
  };
}

function isPlaceholderKey(key: string): boolean {
  return !key || key.startsWith("sk-your-key") || key === "your-key" || key === "xxx";
}

export function isLlmConfigured() {
  return !isPlaceholderKey(getLlmConfig().apiKey);
}

export function isEmbeddingConfigured() {
  return !isPlaceholderKey(getEmbeddingConfig().apiKey);
}

/** 配置自检：把这个高频坑直接说清楚，而不是让用户在 401 里猜 */
export function diagnoseEnv(): string[] {
  const hints: string[] = [];
  const llm = getLlmConfig();
  const emb = getEmbeddingConfig();

  if (isPlaceholderKey(llm.apiKey)) {
    const hasEnvFile = [".env.local", ".env"].some((f) => fs.existsSync(path.join(process.cwd(), f)));
    hints.push("没有读到 OPENAI_API_KEY：请确认密钥写在项目根目录的 .env.local（不是 .env.example），改完要重启 npm run dev。");

    if (!hasEnvFile) {
      hints.push("项目根目录缺少 .env.local / .env 文件。Next.js 不会加载 .env.example，请复制一份改名后再填值。");
    } else {
      const example = path.join(process.cwd(), ".env.example");
      if (fs.existsSync(example)) {
        const match = fs.readFileSync(example, "utf8").match(/^OPENAI_API_KEY=(.+)$/m);
        if (match && !isPlaceholderKey(match[1].trim())) {
          hints.push("检测到 .env.example 里填了真实密钥，但 Next.js 不加载该文件；请把这些值移到 .env.local。");
        }
      }
    }
  }

  if (isPlaceholderKey(emb.apiKey)) {
    hints.push("向量化没有可用密钥：EMBEDDING_API_KEY 留空时会复用 OPENAI_API_KEY。");
  }

  const mismatch = detectEmbeddingMismatch(emb.baseURL, emb.model);
  if (mismatch) hints.push(mismatch);

  if (/bigmodel\.cn/.test(emb.baseURL) && !emb.apiKey.includes(".")) {
    hints.push('智谱的 API Key 形如 "{id}.{secret}"（中间有一个点），当前密钥没有点号，可能只复制了一半。');
  }

  return hints;
}

/** 供前端展示的脱敏状态信息 */
export function getPublicStatus() {
  const llm = getLlmConfig();
  const emb = getEmbeddingConfig();
  return {
    llm: { model: llm.model, baseURL: llm.baseURL, configured: isLlmConfigured() },
    embedding: { model: emb.model, baseURL: emb.baseURL, configured: isEmbeddingConfigured() },
    hints: diagnoseEnv(),
  };
}
