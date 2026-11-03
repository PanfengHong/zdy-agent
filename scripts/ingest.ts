/**
 * 命令行批量建索引：把文件放进 .data/docs，执行 npm run ingest
 * 适合首次初始化、或者把公司文档一次性灌进知识库。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { getPaths } from "../lib/config";
import { isSupported } from "../lib/rag/loader";
import { ingestPath } from "../lib/rag/ingest";

// tsx 不会自动加载 .env，这里手动读一次（Node 20.12+ 提供 loadEnvFile）
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), file));
  } catch {
    /* 文件不存在，跳过 */
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) return out;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function main() {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : getPaths().docs;
  const stat = await fs.stat(target).catch(() => null);

  if (!stat) {
    console.error(`目录不存在：${target}`);
    process.exit(1);
  }

  const files = (await walk(target)).filter((f) => isSupported(path.basename(f)));
  if (files.length === 0) {
    console.log(`目录里没有可导入的文件：${target}`);
    console.log("支持的格式：.pdf .docx .md .txt .csv .json .html");
    return;
  }

  console.log(`发现 ${files.length} 个文件，开始建索引…\n`);

  let ok = 0;
  let fail = 0;

  for (const [index, file] of files.entries()) {
    const label = `[${index + 1}/${files.length}] ${path.basename(file)}`;
    const started = Date.now();
    try {
      const res = await ingestPath(file);
      ok += 1;
      console.log(`  ✓ ${label} · ${res.chunks} 片段 / ${res.chars} 字 · ${Date.now() - started}ms`);
    } catch (err) {
      fail += 1;
      console.error(`  ✕ ${label} · ${(err as Error).message}`);
    }
  }

  console.log(`\n完成：成功 ${ok} 个，失败 ${fail} 个。`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
