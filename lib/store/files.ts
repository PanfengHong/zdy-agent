import fs from "node:fs/promises";
import path from "node:path";
import { getPaths } from "../config";

/**
 * 原始文件存储：知识库索引只保存解析后的文本与向量，这里额外保留上传时的原文件，
 * 供对话中的附件 / 引用文档在线预览。文件按 id 存放，不依赖数据库配置。
 */

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".mdx": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".tsv": "text/tab-separated-values; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

export function mimeOf(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function dir(): string {
  return path.join(getPaths().root, "files");
}

function binPath(id: string): string {
  return path.join(dir(), `${id}.bin`);
}

function metaPath(id: string): string {
  return path.join(dir(), `${id}.json`);
}

const validId = (id: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(id);

export async function saveStoredFile(id: string, name: string, mime: string, buffer: Buffer): Promise<void> {
  if (!validId(id)) throw new Error("非法的文件 id");
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(binPath(id), buffer);
  await fs.writeFile(metaPath(id), JSON.stringify({ name, mime }), "utf8");
}

export async function readStoredFile(
  id: string
): Promise<{ buffer: Buffer; name: string; mime: string } | null> {
  if (!validId(id)) return null;
  try {
    const [buffer, raw] = await Promise.all([fs.readFile(binPath(id)), fs.readFile(metaPath(id), "utf8")]);
    const meta = JSON.parse(raw) as { name?: string; mime?: string };
    return {
      buffer,
      name: meta.name || id,
      mime: meta.mime || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export async function deleteStoredFile(id: string): Promise<void> {
  if (!validId(id)) return;
  await Promise.allSettled([fs.unlink(binPath(id)), fs.unlink(metaPath(id))]);
}
