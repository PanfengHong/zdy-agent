import { randomUUID } from "node:crypto";
import { mimeOf, saveStoredFile } from "@/lib/store/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 图片等附件：只保存原文件供预览，不写入知识库索引 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "请求格式错误，需要 multipart/form-data" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "没有收到文件" }, { status: 400 });

  const results: Array<{ id?: string; name: string; mime: string; ok: boolean; error?: string }> = [];
  for (const file of files.slice(0, 8)) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({ name: file.name, mime: file.type || mimeOf(file.name), ok: false, error: "文件超过 20MB 限制" });
      continue;
    }
    const id = randomUUID();
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = file.type || mimeOf(file.name);
      await saveStoredFile(id, file.name, mime, buffer);
      results.push({ id, name: file.name, mime, ok: true });
    } catch (err) {
      results.push({ name: file.name, mime: file.type || mimeOf(file.name), ok: false, error: (err as Error).message });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return Response.json(
    { results, succeeded: results.length - failed, failed },
    { status: failed === results.length ? 422 : 200 }
  );
}
