import { getVectorStore } from "../llm";
import { getRagConfig } from "../config";
import type { Source } from "../types";

export interface Retrieved {
  source: Source;
  content: string;
}

/** 语义检索：向量召回 -> 阈值过滤 -> 去重 -> 截断 */
export async function retrieve(
  query: string,
  opts: { topK?: number; minScore?: number } = {}
): Promise<Retrieved[]> {
  const rag = getRagConfig();
  const topK = opts.topK ?? rag.topK;
  const minScore = opts.minScore ?? rag.minScore;

  const store = getVectorStore();
  const results = await store.similaritySearchWithScore(query, Math.max(topK * 2, topK));

  const seen = new Set<string>();
  const out: Retrieved[] = [];

  for (const [doc, score] of results) {
    if (score < minScore) continue;
    const id = String(doc.metadata?.id ?? "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);

    out.push({
      source: {
        id,
        source: String(doc.metadata?.source ?? "未知来源"),
        chunk: Number(doc.metadata?.chunk ?? 0),
        score: Number(score.toFixed(4)),
        preview: makePreview(doc.pageContent),
      },
      content: doc.pageContent,
    });
    if (out.length >= topK) break;
  }

  return out;
}

function makePreview(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
