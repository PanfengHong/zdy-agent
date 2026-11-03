import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getEmbeddings, getVectorStore } from "../llm";
import { getEmbeddingConfig, getRagConfig } from "../config";
import type { DocMeta } from "../types";
import { cleanText, extractText, getExtension, isSupported } from "./loader";
import { splitIntoChunks } from "./splitter";
import { findByName, removeDocument, upsertDocument } from "../store/registry";

const MAX_CHUNKS = 4000;

export interface IngestResult {
  id: string;
  name: string;
  chunks: number;
  chars: number;
  replaced: boolean;
}

export interface IngestInput {
  buffer: Buffer;
  filename: string;
  title?: string;
}

/** 上传 -> 解析 -> 切分 -> 向量化 -> 入库，单文件一条流水线 */
export async function ingestFile({ buffer, filename, title }: IngestInput): Promise<IngestResult> {
  const name = path.basename(filename);
  if (!isSupported(name)) {
    throw new Error(`不支持的文件类型：${getExtension(name) || "未知"}（支持 pdf / docx / md / txt / csv / json / html）`);
  }

  const raw = await extractText(buffer, name);
  const text = cleanText(raw);
  if (text.length < 20) {
    throw new Error(`「${name}」解析后有效文本过少（${text.length} 字），可能是扫描版 PDF 或空文件。`);
  }

  const existing = await findByName(name);
  const docId = existing?.id ?? randomUUID();

  const chunks = await splitIntoChunks(text, { source: name, docId, title: title ?? name });
  if (chunks.length === 0) throw new Error(`「${name}」切分后没有有效片段。`);
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(`「${name}」切分出 ${chunks.length} 个片段，超过单文件上限 ${MAX_CHUNKS}，请拆分后再上传。`);
  }

  const embeddings = getEmbeddings();
  const store = getVectorStore();
  let vectors: number[][];
  try {
    vectors = await withRetry(() => embeddings.embedDocuments(chunks.map((c) => c.pageContent)), 3);
  } catch (err) {
    throw new Error(`向量化失败：${describeEmbeddingError((err as Error).message ?? String(err))}`);
  }

  // 同名文件视为「重建索引」：先清掉旧向量，避免重复内容
  await store.deleteBySource(name);
  await store.addVectors(vectors, chunks);

  const now = Date.now();
  const meta: DocMeta = {
    id: docId,
    name,
    ext: getExtension(name).replace(".", ""),
    size: buffer.byteLength,
    chars: text.length,
    chunks: chunks.length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await upsertDocument(meta);

  return { id: docId, name, chunks: chunks.length, chars: text.length, replaced: Boolean(existing) };
}

export async function ingestPath(filePath: string): Promise<IngestResult> {
  const buffer = await fs.readFile(filePath);
  return ingestFile({ buffer, filename: path.basename(filePath) });
}

export async function deleteDocumentById(id: string): Promise<boolean> {
  const { getDocument } = await import("../store/registry");
  const meta = await getDocument(id);
  if (!meta) return false;
  const store = getVectorStore();
  await store.deleteBySource(meta.name);
  await removeDocument(id);
  return true;
}

export function describeIngestConfig() {
  const { chunkSize, chunkOverlap, topK } = getRagConfig();
  return { chunkSize, chunkOverlap, topK };
}

/** 把 401/404 这类典型错误翻译成人能看懂的结论，避免用户对着原始报错猜 */
function describeEmbeddingError(raw: string): string {
  const cfg = getEmbeddingConfig();
  if (/401|unauthor|invalid.*(key|token)|令牌|鉴权/i.test(raw)) {
    return `密钥无效或已过期（当前接口 ${cfg.baseURL}，模型 ${cfg.model}）。请核对 EMBEDDING_API_KEY 是否是完整的 Key。原始信息：${raw}`;
  }
  if (/404|model.*(not|does not).*(exist|found)|模型不存在/i.test(raw)) {
    return `模型 "${cfg.model}" 在该接口不存在，请核对 EMBEDDING_MODEL。原始信息：${raw}`;
  }
  if (/429|rate limit|限流/i.test(raw)) {
    return `触发向量化接口限流，请降低上传批量或稍后重试。原始信息：${raw}`;
  }
  return `请检查 EMBEDDING_BASE_URL / EMBEDDING_MODEL 是否正确（当前 ${cfg.baseURL} / ${cfg.model}）。原始信息：${raw}`;
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}
