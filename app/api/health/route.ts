import { getPublicStatus } from "@/lib/config";
import { isDatabaseConfigured, pingDatabase } from "@/lib/db/pg";
import { registryStats } from "@/lib/store/registry";
import { getVectorStore } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getPublicStatus();
  const dbConfigured = isDatabaseConfigured();
  const dbResult: { ok: boolean; error?: string } = { ok: false };
  const [registry, vectors, db] = await Promise.all([
    registryStats(),
    getVectorStore()
      .stats()
      .catch(() => ({ chunks: 0, sources: 0, dim: 0 })),
    dbConfigured ? pingDatabase() : Promise.resolve(dbResult),
  ]);

  return Response.json({
    ok: status.llm.configured && status.embedding.configured,
    ...status,
    database: { mode: dbConfigured ? "postgres" : "file", connected: db.ok, error: db.error },
    knowledgeBase: { ...registry, vectors: vectors.chunks, dim: vectors.dim },
  });
}
