import fs from "node:fs/promises";
import path from "node:path";
import { VectorStore } from "@langchain/core/vectorstores";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { Document } from "@langchain/core/documents";

export interface VectorRecord {
  id: string;
  /** 已做 L2 归一化，点积即余弦相似度 */
  vector: number[];
  content: string;
  metadata: Record<string, unknown>;
}

interface StoreFile {
  version: 1;
  dim: number;
  records: VectorRecord[];
}

/**
 * 零依赖的本地文件向量库。
 *
 * 设计取舍：
 * - 索引常驻内存 + JSON 持久化，几千~几万 chunk 检索毫秒级，够用且不引入任何外部服务；
 * - 向量入库时做 L2 归一化，检索退化为点积，避免每次算模长；
 * - 写入用「临时文件 + rename」保证原子性，并用串行队列避免并发覆盖。
 *
 * 数据量超过 10 万 chunk、或需要多实例共享时，替换为 pgvector / LanceDB，
 * 调用方只依赖 VectorStore 抽象，改动仅在 lib/llm.ts 的工厂函数。
 */
export class FileVectorStore extends VectorStore {
  declare lc_namespace: string[];
  _vectorstoreType(): string {
    return "file";
  }

  private filePath: string;
  private records: VectorRecord[] = [];
  private dim = 0;
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(embeddings: EmbeddingsInterface, opts: { filePath: string }) {
    super(embeddings, opts);
    this.lc_namespace = ["lib", "vectorstore", "file"];
    this.filePath = opts.filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      this.records = parsed.records ?? [];
      this.dim = parsed.dim ?? 0;
    } catch {
      this.records = [];
      this.dim = 0;
    }
  }

  private persist(): Promise<void> {
    // 串行化写入，避免两个请求同时 addVectors 造成数据丢失
    this.writeQueue = this.writeQueue.then(async () => {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      const payload: StoreFile = { version: 1, dim: this.dim, records: this.records };
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(payload), "utf8");
      await fs.rename(tmp, this.filePath);
    });
    return this.writeQueue;
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const vectors = await this.embeddings.embedDocuments(documents.map((d) => d.pageContent));
    await this.addVectors(vectors, documents);
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    await this.ensureLoaded();
    if (vectors.length !== documents.length) {
      throw new Error("vectors 与 documents 数量不一致");
    }
    if (this.dim === 0 && vectors.length > 0) this.dim = vectors[0].length;

    vectors.forEach((vec, i) => {
      if (vec.length !== this.dim) {
        throw new Error(
          `向量维度不一致：期望 ${this.dim}，实际 ${vec.length}。` +
            `更换 embedding 模型后需要重建索引（删除 .data/index 后重新上传）。`
        );
      }
      const doc = documents[i];
      this.records.push({
        id: doc.metadata?.id ? String(doc.metadata.id) : `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        vector: normalize(vec),
        content: doc.pageContent,
        metadata: { ...doc.metadata },
      });
    });

    await this.persist();
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: Record<string, unknown>
  ): Promise<[Document, number][]> {
    await this.ensureLoaded();
    if (this.records.length === 0) return [];

    const q = normalize(query);
    const scored: [Document, number][] = [];

    for (const rec of this.records) {
      if (filter && !matchesFilter(rec.metadata, filter)) continue;
      const score = dot(q, rec.vector);
      scored.push([
        new Document({ pageContent: rec.content, metadata: { ...rec.metadata, id: rec.id } }),
        score,
      ]);
    }

    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, k);
  }

  /** 按来源文件名删除（用于同名文件重新入库） */
  async deleteBySource(source: string): Promise<number> {
    await this.ensureLoaded();
    const before = this.records.length;
    this.records = this.records.filter((r) => r.metadata?.source !== source);
    const removed = before - this.records.length;
    if (removed > 0) await this.persist();
    return removed;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.ensureLoaded();
    const set = new Set(ids);
    this.records = this.records.filter((r) => !set.has(r.id));
    await this.persist();
  }

  async clear(): Promise<void> {
    await this.ensureLoaded();
    this.records = [];
    this.dim = 0;
    await this.persist();
  }

  async stats(): Promise<{ chunks: number; sources: number; dim: number }> {
    await this.ensureLoaded();
    const sources = new Set(this.records.map((r) => String(r.metadata?.source ?? "")));
    return { chunks: this.records.length, sources: sources.size, dim: this.dim };
  }
}

function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const len = Math.sqrt(sum);
  if (len === 0) return vec.slice();
  return vec.map((v) => v / len);
}

function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

function matchesFilter(metadata: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const cond = value as Record<string, unknown>;
      if ("in" in cond && Array.isArray(cond.in)) {
        return (cond.in as unknown[]).includes(metadata[key]);
      }
      if ("ne" in cond) return metadata[key] !== cond.ne;
    }
    return metadata[key] === value;
  });
}
