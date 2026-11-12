import pg from "pg";

/**
 * PostgreSQL 连接层（可选持久层）。
 *
 * 设计：
 * - 未设置 DATABASE_URL 时应用走「本地文件模式」（JSON 向量索引 + 文档注册表），
 *   本地开发零依赖；设置后自动切换到数据库模式，用于 Docker / 生产部署。
 * - 建表语句幂等，首个使用连接的请求触发一次 ensureSchema。
 * - 向量以 JSONB 存储（已 L2 归一化），检索在 Node 内存中做点积——
 *   与 FileVectorStore 的内存索引模型一致，避免引入 pgvector 扩展依赖。
 */

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim() ?? "";
    if (!connectionString) throw new Error("getPool() 被调用时未设置 DATABASE_URL");
    pool = new pg.Pool({
      connectionString,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    pool.on("error", (err) => {
      console.error("[db] 连接池空闲客户端异常:", err.message);
    });
  }
  return pool;
}

/** 幂等建表；并发调用共享同一个 Promise */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await getPool().connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS documents (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL UNIQUE,
            ext        TEXT NOT NULL DEFAULT '',
            size       BIGINT NOT NULL DEFAULT 0,
            chars      BIGINT NOT NULL DEFAULT 0,
            chunks     INT    NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS vector_records (
            id        TEXT PRIMARY KEY,
            source    TEXT NOT NULL,
            content   TEXT NOT NULL,
            metadata  JSONB NOT NULL DEFAULT '{}'::jsonb,
            embedding JSONB NOT NULL,
            dim       INT   NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_vector_records_source ON vector_records (source)`);
      } finally {
        client.release();
      }
    })();
  }
  return schemaReady;
}

/** 探活：SELECT 1，带超时保护 */
export async function pingDatabase(): Promise<{ ok: boolean; error?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, error: "未配置 DATABASE_URL" };
  try {
    const client = await getPool().connect();
    try {
      await client.query("SELECT 1");
      return { ok: true };
    } finally {
      client.release();
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** 优雅关闭（进程退出时调用） */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => undefined);
    pool = null;
    schemaReady = null;
  }
}
