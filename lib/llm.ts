import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { getEmbeddingConfig, getLlmConfig, getPaths, isEmbeddingConfigured, isLlmConfigured, diagnoseEnv } from "./config";
import { isDatabaseConfigured } from "./db/pg";
import { FileVectorStore } from "./vectorstore/FileVectorStore";
import { PgVectorStore } from "./vectorstore/PgVectorStore";

let chatModel: ChatOpenAI | null = null;
let embeddings: OpenAIEmbeddings | null = null;
let vectorStore: FileVectorStore | PgVectorStore | null = null;

export function assertLlmReady() {
  if (!isLlmConfigured()) {
    throw new Error(["未配置对话模型密钥。", diagnoseEnv()[0] ?? ""].join(" "));
  }
}

export function getChatModel(): ChatOpenAI {
  assertLlmReady();
  const cfg = getLlmConfig();
  if (!chatModel) {
    chatModel = new ChatOpenAI({
      apiKey: cfg.apiKey,
      model: cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      configuration: { baseURL: cfg.baseURL },
    });
  }
  return chatModel;
}

export function getEmbeddings(): EmbeddingsInterface {
  if (!isEmbeddingConfigured()) {
    const hints = diagnoseEnv();
    throw new Error(["未配置向量化（embedding）模型密钥。", ...hints].join(" "));
  }
  const cfg = getEmbeddingConfig();
  if (!embeddings) {
    embeddings = new OpenAIEmbeddings({
      apiKey: cfg.apiKey,
      model: cfg.model,
      batchSize: 32,
      configuration: { baseURL: cfg.baseURL },
    });
  }
  return embeddings;
}

/**
 * 向量库工厂：配置了 DATABASE_URL 走 PostgreSQL，否则用本地 JSON 文件。
 * 调用方只依赖 VectorStore 抽象，两种后端接口完全一致。
 */
export function getVectorStore(): FileVectorStore | PgVectorStore {
  if (!vectorStore) {
    vectorStore = isDatabaseConfigured()
      ? new PgVectorStore(getEmbeddings())
      : new FileVectorStore(getEmbeddings(), { filePath: getPaths().vectorFile });
  }
  return vectorStore;
}

/** 热更新配置后重置单例（供调试用） */
export function resetModelCache() {
  chatModel = null;
  embeddings = null;
  vectorStore = null;
}
