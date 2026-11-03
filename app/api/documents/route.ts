import { deleteDocumentById, ingestFile } from "@/lib/rag/ingest";
import { listDocuments, registryStats } from "@/lib/store/registry";
import { diagnoseEnv, isEmbeddingConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function GET() {
  const [documents, stats] = await Promise.all([listDocuments(), registryStats()]);
  return Response.json({ documents, stats, embeddingConfigured: isEmbeddingConfigured() });
}

export async function POST(req: Request) {
  if (!isEmbeddingConfigured()) {
    return Response.json(
      {
        error: "未配置向量化（embedding）模型，无法写入索引。",
        hints: diagnoseEnv(),
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "请求格式错误，需要 multipart/form-data" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "没有收到文件" }, { status: 400 });
  }

  const results: Array<{
    name: string;
    ok: boolean;
    chunks?: number;
    chars?: number;
    replaced?: boolean;
    error?: string;
  }> = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({ name: file.name, ok: false, error: "文件超过 20MB 限制" });
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const res = await ingestFile({ buffer, filename: file.name });
      results.push({ name: res.name, ok: true, chunks: res.chunks, chars: res.chars, replaced: res.replaced });
    } catch (err) {
      results.push({ name: file.name, ok: false, error: (err as Error).message });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return Response.json(
    { results, succeeded: results.length - failed, failed },
    { status: failed === results.length ? 422 : 200 }
  );
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少 id 参数" }, { status: 400 });

  const ok = await deleteDocumentById(id);
  if (!ok) return Response.json({ error: "文档不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
