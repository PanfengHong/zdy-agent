import { readStoredFile } from "@/lib/store/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = await readStoredFile(id);
  if (!stored) return new Response("文件不存在", { status: 404 });

  const filename = encodeURIComponent(stored.name);
  return new Response(new Uint8Array(stored.buffer), {
    headers: {
      "Content-Type": stored.mime,
      "Content-Length": String(stored.buffer.length),
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
