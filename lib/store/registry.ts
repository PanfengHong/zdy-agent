import fs from "node:fs/promises";
import path from "node:path";
import { getPaths } from "../config";
import { ensureSchema, getPool, isDatabaseConfigured } from "../db/pg";
import type { DocMeta } from "../types";

/**
 * 文档注册表：文档元数据（不含正文与向量）。
 * - 未配置 DATABASE_URL → 本地 JSON 文件（documents.json）
 * - 配置了 DATABASE_URL → PostgreSQL `documents` 表
 * 两种后端对外接口完全一致，调用方无感知。
 */

interface RegistryFile {
  version: 1;
  documents: DocMeta[];
}

/* ============ 文件模式 ============ */

let cache: DocMeta[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function fileLoad(): Promise<DocMeta[]> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(getPaths().registryFile, "utf8");
    const parsed = JSON.parse(raw) as RegistryFile;
    cache = parsed.documents ?? [];
  } catch {
    cache = [];
  }
  return cache;
}

function filePersist(docs: DocMeta[]): Promise<void> {
  const file = getPaths().registryFile;
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const payload: RegistryFile = { version: 1, documents: docs };
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await fs.rename(tmp, file);
  });
  return writeQueue;
}

/* ============ 数据库模式 ============ */

function rowToMeta(row: { id: string; name: string; ext: string; size: string | number; chars: string | number; chunks: number; created_at: string | number; updated_at: string | number }): DocMeta {
  return {
    id: row.id,
    name: row.name,
    ext: row.ext,
    size: Number(row.size),
    chars: Number(row.chars),
    chunks: Number(row.chunks),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function dbList(): Promise<DocMeta[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, ext, size, chars, chunks, created_at, updated_at FROM documents ORDER BY updated_at DESC`
  );
  return rows.map(rowToMeta);
}

/* ============ 对外接口（按配置分发） ============ */

export async function listDocuments(): Promise<DocMeta[]> {
  if (!isDatabaseConfigured()) {
    const docs = await fileLoad();
    return [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return dbList();
}

export async function getDocument(id: string): Promise<DocMeta | undefined> {
  if (!isDatabaseConfigured()) {
    const docs = await fileLoad();
    return docs.find((d) => d.id === id);
  }
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, ext, size, chars, chunks, created_at, updated_at FROM documents WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToMeta(rows[0]) : undefined;
}

export async function findByName(name: string): Promise<DocMeta | undefined> {
  if (!isDatabaseConfigured()) {
    const docs = await fileLoad();
    return docs.find((d) => d.name === name);
  }
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, ext, size, chars, chunks, created_at, updated_at FROM documents WHERE name = $1`,
    [name]
  );
  return rows[0] ? rowToMeta(rows[0]) : undefined;
}

export async function upsertDocument(meta: DocMeta): Promise<void> {
  if (!isDatabaseConfigured()) {
    const docs = await fileLoad();
    const idx = docs.findIndex((d) => d.id === meta.id);
    if (idx >= 0) docs[idx] = meta;
    else docs.push(meta);
    cache = docs;
    await filePersist(docs);
    return;
  }
  await ensureSchema();
  await getPool().query(
    `INSERT INTO documents (id, name, ext, size, chars, chunks, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       ext = EXCLUDED.ext,
       size = EXCLUDED.size,
       chars = EXCLUDED.chars,
       chunks = EXCLUDED.chunks,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [meta.id, meta.name, meta.ext, meta.size, meta.chars, meta.chunks, meta.createdAt, meta.updatedAt]
  );
}

export async function removeDocument(id: string): Promise<DocMeta | undefined> {
  if (!isDatabaseConfigured()) {
    const docs = await fileLoad();
    const idx = docs.findIndex((d) => d.id === id);
    if (idx < 0) return undefined;
    const [removed] = docs.splice(idx, 1);
    cache = docs;
    await filePersist(docs);
    return removed;
  }
  const meta = await getDocument(id);
  if (!meta) return undefined;
  await ensureSchema();
  await getPool().query(`DELETE FROM documents WHERE id = $1`, [id]);
  return meta;
}

export async function registryStats(): Promise<{ documents: number; chunks: number; chars: number }> {
  if (!isDatabaseConfigured()) {
    const docs = await fileLoad();
    return {
      documents: docs.length,
      chunks: docs.reduce((s, d) => s + d.chunks, 0),
      chars: docs.reduce((s, d) => s + d.chars, 0),
    };
  }
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS documents, COALESCE(SUM(chunks), 0)::int AS chunks, COALESCE(SUM(chars), 0)::bigint AS chars FROM documents`
  );
  return { documents: rows[0].documents, chunks: rows[0].chunks, chars: Number(rows[0].chars) };
}
