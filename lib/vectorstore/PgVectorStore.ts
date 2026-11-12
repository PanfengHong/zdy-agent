import { VectorStore } from "@langchain/core/vectorstores";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { Document } from "@langchain/core/documents";
import { ensureSchema, getPool } from "../db/pg";
import type { VectorRecord } from "./FileVectorStore";

/**
 * PostgreSQL 向量库：接口与 FileVectorStore 完全一致。
 *
 * 存储：embedding 已 L2 归一化，JSONB 落库；
 * 检索：记录整表载入内存缓存后做点积（与文件模式的内存索引模型相同），
 * 写操作同步更新缓存并落库。数据量到十万 chunk 量级可平滑升级 pgvector。
 */
export class PgVectorStore extends VectorStore {
  declare lc_namespace: string[];
  _vectorstoreType(): string {
    return "postgres";
  }

  private records: VectorRecord[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(embeddings: EmbeddingsInterface) {
    super(embeddings, {});
    this.lc_namespace = ["lib", "vectorstore", "pg"];
  }

  private async load(): Promise<VectorRecord[]> {
    if (this.records) return this.records;
    await ensureSchema();
    const { rows } = await getPool().query<{
      id: string;
      content: string;
      metadata: Record<string, unknown>;
      embedding: number[];
    }>(`SELECT id, content, metadata, embedding FROM vector_records`);
    this.records = rows.map((r) => ({
      id: r.id,
      content: r.content,
      metadata: r.metadata ?? {},
      vector: r.embedding,
    }));
    return this.records;
  }

  private invalidate(): void {
    this.records = null;
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const vectors = await this.embeddings.embedDocuments(documents.map((d) => d.pageContent));
    await this.addVectors(vectors, documents);
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    if (vectors.length !== documents.length) {
      throw new Error("vectors 与 documents 数量不一致");
    }
    await ensureSchema();
    const dim = vectors[0]?.length ?? 0;
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < vectors.length; i++) {
        const doc = documents[i];
        const id = doc.metadata?.id ? String(doc.metadata.id) : `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
        const vector = normalize(vectors[i]);
        if (dim && vector.length !== dim) {
          throw new Error(
            `向量维度不一致：期望 ${dim}，实际 ${vector.length}。更换 embedding 模型后需要重建索引（删除全部文档后重新上传）。`
          );
        }
        await client.query(
          `INSERT INTO vector_records (id, source, content, metadata, embedding, dim)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
           ON CONFLICT (id) DO UPDATE SET
             source = EXCLUDED.source,
             content = EXCLUDED.content,
             metadata = EXCLUDED.metadata,
             embedding = EXCLUDED.embedding,
             dim = EXCLUDED.dim`,
          [id, String(doc.metadata?.source ?? ""), doc.pageContent, JSON.stringify({ ...doc.metadata }), JSON.stringify(vector), vector.length]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    this.invalidate();
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: Record<string, unknown>
  ): Promise<[Document, number][]> {
    const records = await this.load();
    if (records.length === 0) return [];

    const q = normalize(query);
    const scored: [Document, number][] = [];
    for (const rec of records) {
      if (filter && !matchesFilter(rec.metadata, filter)) continue;
      scored.push([
        new Document({ pageContent: rec.content, metadata: { ...rec.metadata, id: rec.id } }),
        dot(q, rec.vector),
      ]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, k);
  }

  /** 按来源文件名删除（用于同名文件重新入库） */
  async deleteBySource(source: string): Promise<number> {
    await ensureSchema();
    const res = await getPool().query(`DELETE FROM vector_records WHERE source = $1`, [source]);
    this.invalidate();
    return res.rowCount ?? 0;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await ensureSchema();
    await getPool().query(`DELETE FROM vector_records WHERE id = ANY($1::text[])`, [ids]);
    this.invalidate();
  }

  async clear(): Promise<void> {
    await ensureSchema();
    await getPool().query(`TRUNCATE vector_records`);
    this.invalidate();
  }

  async stats(): Promise<{ chunks: number; sources: number; dim: number }> {
    const records = await this.load();
    const sources = new Set(records.map((r) => String(r.metadata?.source ?? "")));
    return { chunks: records.length, sources: sources.size, dim: records[0]?.vector.length ?? 0 };
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
