"use client";

import { useEffect, useReducer } from "react";
import type { PluginMeta } from "./types";

/**
 * 插件的「启用状态」存在浏览器本地，随每次对话请求一起发给服务端，
 * 这样插件能力由用户自己决定开不开，服务端不需要保存任何状态。
 */

const PREFS_KEY = "zdy:plugins:v1";
const CHANGE_EVENT = "zdy:plugins-changed";

const isBrowser = () => typeof window !== "undefined";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

let prefsCache: Record<string, boolean> | null = null;

function prefs(): Record<string, boolean> {
  if (!isBrowser()) return {};
  if (!prefsCache) {
    const raw = safeParse<Record<string, boolean>>(localStorage.getItem(PREFS_KEY), {});
    prefsCache = raw && typeof raw === "object" ? raw : {};
  }
  return prefsCache;
}

function emit() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** 用户是否启用了该插件（没设置过时用插件自己的默认值） */
export function isPluginEnabled(meta: PluginMeta): boolean {
  const saved = prefs()[meta.id];
  return typeof saved === "boolean" ? saved : meta.defaultEnabled;
}

export function setPluginEnabled(id: string, on: boolean) {
  if (!isBrowser()) return;
  const next = { ...prefs(), [id]: on };
  prefsCache = next;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* 配额不足时只在内存里生效 */
  }
  emit();
}

/** 恢复默认：清掉本地覆盖，让所有插件回到各自 defaultEnabled */
export function resetPluginPrefs() {
  if (!isBrowser()) return;
  prefsCache = {};
  localStorage.removeItem(PREFS_KEY);
  emit();
}

export function enabledPluginIds(list: PluginMeta[]): string[] {
  return list.filter((p) => !p.error && isPluginEnabled(p)).map((p) => p.id);
}

/* ---------- 插件清单：模块级缓存，避免侧边栏 / 输入框 / 插件页各拉一次 ---------- */

interface Store {
  plugins: PluginMeta[];
  loading: boolean;
  error: string | null;
}

let store: Store = { plugins: [], loading: true, error: null };
const listeners = new Set<() => void>();

function publish(patch: Partial<Store>) {
  store = { ...store, ...patch };
  listeners.forEach((fn) => fn());
}

export async function loadPluginList(force = false): Promise<PluginMeta[]> {
  if (!force && !store.loading && store.plugins.length > 0) return store.plugins;
  publish({ loading: true, error: null });
  try {
    const res = await fetch(`/api/plugins${force ? "?reload=1" : ""}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { plugins?: PluginMeta[] };
    const list = Array.isArray(data?.plugins) ? data.plugins : [];
    publish({ plugins: list, loading: false });
    return list;
  } catch (err) {
    publish({ loading: false, error: (err as Error).message });
    return [];
  }
}

/** 组件里读取插件清单与启用状态；清单或开关变化都会触发重渲染 */export function usePlugins() {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const fn = () => bump();
    listeners.add(fn);
    window.addEventListener(CHANGE_EVENT, fn);
    window.addEventListener("storage", fn);
    return () => {
      listeners.delete(fn);
      window.removeEventListener(CHANGE_EVENT, fn);
      window.removeEventListener("storage", fn);
    };
  }, []);

  useEffect(() => {
    void loadPluginList();
  }, []);

  return {
    plugins: store.plugins,
    loading: store.loading,
    error: store.error,
    reload: () => loadPluginList(true),
  };
}

/* ---------- 插件页「用这个」跳转到对话页时的交接 ---------- */

const DRAFT_KEY = "zdy:plugin-draft:v1";

export interface PluginDraft {
  pluginId: string;
  template: string;
}

export function setPluginDraft(draft: PluginDraft) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* 忽略 */
  }
}

/** 读取并清除：对话页只会消费一次，避免刷新后又被填进输入框 */
export function takePluginDraft(): PluginDraft | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  localStorage.removeItem(DRAFT_KEY);
  const parsed = safeParse<PluginDraft | null>(raw, null);
  if (!parsed || typeof parsed.pluginId !== "string" || typeof parsed.template !== "string") return null;
  return parsed;
}
