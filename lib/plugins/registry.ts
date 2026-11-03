import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type {
  PluginContext,
  PluginDefinition,
  PluginField,
  PluginMeta,
  PluginToolMeta,
  PluginToolSpec,
} from "./types";

/**
 * 插件注册表
 *
 * 约定：`plugins/<目录>/index.mjs` 默认导出一个 PluginDefinition。
 * - 目录以 `_` 或 `.` 开头的会被跳过（`_template` 用来放脚手架）
 * - 按目录名排序加载，加载失败不会影响其他插件，只会把错误挂在该插件上
 * - 生产环境缓存模块，开发环境每次都重新读盘（改完插件刷新页面即生效）
 */

const PLUGIN_ROOT = path.join(process.cwd(), "plugins");
const ENTRY_CANDIDATES = ["index.mjs", "index.js", "plugin.mjs", "plugin.js"];

/** 运行时可直接交给 LangChain 的工具（宽松类型，避免不同 schema 打架） */
export interface RuntimeTool {
  name: string;
  description: string;
  invoke: (input: Record<string, unknown>) => Promise<unknown>;
  /** 原始 LangChain 工具实例，bindTools 需要它（只传 name/invoke 会被丢弃） */
  raw: unknown;
}

export interface LoadedPlugin {
  meta: PluginMeta;
  tools: RuntimeTool[];
}

let cache: LoadedPlugin[] | null = null;

export function pluginRoot(): string {
  return PLUGIN_ROOT;
}

/** 找到插件目录的入口文件 */
async function findEntry(dir: string): Promise<string | null> {
  for (const name of ENTRY_CANDIDATES) {
    const file = path.join(dir, name);
    try {
      const stat = await fs.stat(file);
      if (stat.isFile()) return file;
    } catch {
      /* 继续找下一个 */
    }
  }
  return null;
}

/** 开发环境下用 mtime 做 cache-busting，避免 Node 的 ESM 缓存导致改了代码不生效 */
async function importUrl(file: string): Promise<string> {
  const base = pathToFileURL(file).href;
  if (process.env.NODE_ENV === "production") return base;
  try {
    const stat = await fs.stat(file);
    return `${base}?v=${stat.mtimeMs}`;
  } catch {
    return base;
  }
}

function labelOf(t: PluginToolSpec): string {
  return t.label?.trim() || t.name;
}

/** 把声明式 schema 转成 zod，供模型理解入参 */
function toZod(schema?: Record<string, PluginField>): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const [key, field] of Object.entries(schema ?? {})) {
    let item: z.ZodTypeAny;
    if (field.type === "number") item = z.number();
    else if (field.type === "boolean") item = z.boolean();
    else if (field.type === "enum" && field.enum?.length) item = z.enum(field.enum as [string, ...string[]]);
    else item = z.string();

    if (field.description) item = item.describe(field.description);
    if (field.optional) item = item.optional();
    shape[key] = item;
  }
  return z.object(shape);
}

function normalize(def: PluginDefinition, dirName: string): LoadedPlugin {
  if (!def || typeof def !== "object") throw new Error("插件没有默认导出对象");
  if (!def.id || typeof def.id !== "string") throw new Error("缺少 id");
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(def.id)) throw new Error(`id 不合法：${def.id}（只允许字母数字、- 和 _）`);
  if (!def.name) throw new Error("缺少 name");
  if (!def.description) throw new Error("缺少 description");

  const toolSpecs = Array.isArray(def.tools) ? def.tools : [];
  const seen = new Set<string>();
  for (const t of toolSpecs) {
    if (!t?.name) throw new Error("存在没有 name 的工具");
    if (typeof t.run !== "function") throw new Error(`工具 ${t.name} 缺少 run 函数`);
    if (!t.description) throw new Error(`工具 ${t.name} 缺少 description（模型靠它判断何时调用）`);
    if (seen.has(t.name)) throw new Error(`工具名重复：${t.name}`);
    seen.add(t.name);
  }

  const meta: PluginMeta = {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon?.trim() || "🧩",
    version: def.version?.trim() || "0.0.0",
    author: def.author?.trim() || "未署名",
    defaultEnabled: def.defaultEnabled !== false,
    dir: dirName,
    instructions: def.instructions?.trim() || undefined,
    commands: (def.commands ?? []).filter((c) => c?.name && c?.template),
    prompts: (def.prompts ?? []).filter((p) => p?.title && p?.prompt),
    tools: toolSpecs.map<PluginToolMeta>((t) => ({ name: t.name, label: labelOf(t), description: t.description })),
  };

  const runtimeTools = toolSpecs.map<RuntimeTool>((spec) => {
    const ctx: PluginContext = {
      pluginId: def.id,
      env: process.env,
      now: new Date(),
      log: (...args) => console.log(`[plugin:${def.id}]`, ...args),
    };

    const fn = tool(
      async (args: Record<string, unknown>) => {
        const out = await spec.run(args ?? {}, { ...ctx, now: new Date() });
        if (typeof out === "string") return out;
        return out === undefined || out === null ? "（插件没有返回内容）" : JSON.stringify(out);
      },
      {
        name: spec.name,
        description: spec.description,
        schema: toZod(spec.schema),
      }
    );

    return { name: spec.name, description: spec.description, raw: fn, invoke: (input) => fn.invoke(input) };
  });

  return { meta, tools: runtimeTools };
}

function brokenEntry(dirName: string, err: unknown): LoadedPlugin {
  const message = (err as Error)?.message ?? String(err);
  return {
    meta: {
      id: dirName,
      name: dirName,
      description: "插件加载失败",
      icon: "⚠️",
      version: "-",
      author: "-",
      defaultEnabled: false,
      dir: dirName,
      commands: [],
      prompts: [],
      tools: [],
      error: message,
    },
    tools: [],
  };
}

/** 扫描 plugins/ 下所有插件 */
export async function loadPlugins(force = false): Promise<LoadedPlugin[]> {
  if (!force && cache && process.env.NODE_ENV === "production") return cache;

  let entries: Dirent[];
  try {
    entries = (await fs.readdir(PLUGIN_ROOT, { withFileTypes: true })) as Dirent[];
  } catch {
    cache = [];
    return cache;
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  const out: LoadedPlugin[] = [];
  for (const name of dirs) {
    const dir = path.join(PLUGIN_ROOT, name);
    try {
      const entry = await findEntry(dir);
      if (!entry) continue;
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ await importUrl(entry))) as {
        default?: PluginDefinition;
        plugin?: PluginDefinition;
      };
      const def = mod.default ?? mod.plugin;
      if (!def) throw new Error("插件需要 export default 一个对象");
      out.push(normalize(def, name));
    } catch (err) {
      console.error(`[plugins] 加载 ${name} 失败：`, (err as Error)?.message ?? err);
      out.push(brokenEntry(name, err));
    }
  }

  cache = out;
  return out;
}

/** 供 /api/plugins 使用的元数据列表 */
export async function listPluginMetas(): Promise<PluginMeta[]> {
  const all = await loadPlugins();
  return all.map((p) => p.meta);
}

export interface PluginContributions {
  tools: RuntimeTool[];
  /** 工具名 -> 展示名，用于界面上的调用轨迹 */
  labels: Record<string, string>;
  /** 插件 id -> 展示名，用于「本次指定了某插件」的提示 */
  names: Record<string, string>;
  /** 需要追加到系统提示词的内容 */
  instructions: string;
}

/**
 * 取本次请求要生效的插件能力
 * @param ids null 表示使用插件自身的 defaultEnabled
 */
export async function getPluginContributions(ids: string[] | null): Promise<PluginContributions> {
  const all = await loadPlugins();
  const active = all.filter((p) => {
    if (p.meta.error) return false;
    return ids === null ? p.meta.defaultEnabled : ids.includes(p.meta.id);
  });

  const labels: Record<string, string> = {};
  const names: Record<string, string> = {};
  const tools: RuntimeTool[] = [];
  const lines: string[] = [];

  for (const plugin of active) {
    names[plugin.meta.id] = plugin.meta.name;
    for (const t of plugin.tools) {
      tools.push(t);
      labels[t.name] = plugin.meta.tools.find((m) => m.name === t.name)?.label ?? t.name;
    }
    if (plugin.meta.instructions) {
      lines.push(`【${plugin.meta.name}】${plugin.meta.instructions}`);
    }
  }

  return { tools, labels, names, instructions: lines.join("\n") };
}

/** 让同一进程内的插件工具名不重复（重名时只保留第一个，并在日志里提示） */
export function dedupeTools(tools: RuntimeTool[]): RuntimeTool[] {
  const seen = new Set<string>();
  const out: RuntimeTool[] = [];
  for (const t of tools) {
    if (seen.has(t.name)) {
      console.warn(`[plugins] 工具名冲突，已忽略：${t.name}`);
      continue;
    }
    seen.add(t.name);
    out.push(t);
  }
  return out;
}
