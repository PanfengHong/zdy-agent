import { getPublicStatus } from "@/lib/config";
import { registryStats } from "@/lib/store/registry";
import { getVectorStore } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getPublicStatus();
  const [registry, vectors] = await Promise.all([
    registryStats(),
    getVectorStore()
      .stats()
      .catch(() => ({ chunks: 0, sources: 0, dim: 0 })),
  ]);

  return Response.json({
    ok: status.llm.configured && status.embedding.configured,
    ...status,
    knowledgeBase: { ...registry, vectors: vectors.chunks, dim: vectors.dim },
  });
}
