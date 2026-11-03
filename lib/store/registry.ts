import fs from "node:fs/promises";
import path from "node:path";
import { getPaths } from "../config";
import type { DocMeta } from "../types";

interface RegistryFile {
  version: 1;
  documents: DocMeta[];
}

let cache: DocMeta[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<DocMeta[]> {
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

function persist(docs: DocMeta[]): Promise<void> {
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

export async function listDocuments(): Promise<DocMeta[]> {
  const docs = await load();
  return [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDocument(id: string): Promise<DocMeta | undefined> {
  const docs = await load();
  return docs.find((d) => d.id === id);
}

export async function findByName(name: string): Promise<DocMeta | undefined> {
  const docs = await load();
  return docs.find((d) => d.name === name);
}

export async function upsertDocument(meta: DocMeta): Promise<void> {
  const docs = await load();
  const idx = docs.findIndex((d) => d.id === meta.id);
  if (idx >= 0) docs[idx] = meta;
  else docs.push(meta);
  cache = docs;
  await persist(docs);
}

export async function removeDocument(id: string): Promise<DocMeta | undefined> {
  const docs = await load();
  const idx = docs.findIndex((d) => d.id === id);
  if (idx < 0) return undefined;
  const [removed] = docs.splice(idx, 1);
  cache = docs;
  await persist(docs);
  return removed;
}

export async function registryStats(): Promise<{ documents: number; chunks: number; chars: number }> {
  const docs = await load();
  return {
    documents: docs.length,
    chunks: docs.reduce((s, d) => s + d.chunks, 0),
    chars: docs.reduce((s, d) => s + d.chars, 0),
  };
}
