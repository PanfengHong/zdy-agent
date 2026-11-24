"use client";

import type { ChatMessage } from "./types";

/**
 * 会话存储（浏览器本地）。
 * - 索引存 `zdy:conversations:v1`：只放标题 / 时间 / 条数，便于快速渲染列表
 * - 正文存 `zdy:conv:<id>`：按会话分片，避免一次读写整个大 JSON
 * - 当前会话 id 存 `zdy:active:v1`
 * 任何写入都会广播事件，让侧边栏与对话区保持同步（并处理多标签页的 storage 事件）。
 */

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  count: number;
  /** 用户手动重命名过：后续 saveMessages 不再用首条提问覆盖标题 */
  customTitle?: boolean;
  /** 置顶会话：列表最前展示，且不会被上限清理淘汰 */
  pinned?: boolean;
  /** 所属分组名；为空表示未分组 */
  group?: string;
}

const INDEX_KEY = "zdy:conversations:v1";
const ACTIVE_KEY = "zdy:active:v1";
const MSG_PREFIX = "zdy:conv:";
const LEGACY_KEY = "lrag:chat:v1";
const CHANGE_EVENT = "zdy:conversations-changed";
const MAX_CONVERSATIONS = 60;

const isBrowser = () => typeof window !== "undefined";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function emit() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function writeIndex(list: ConversationMeta[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    /* 配额不足时放弃索引更新，正文仍可写入 */
  }
}

export function listConversations(): ConversationMeta[] {
  if (!isBrowser()) return [];
  const list = safeParse<ConversationMeta[]>(localStorage.getItem(INDEX_KEY), []);
  if (!Array.isArray(list)) return [];
  // 置顶优先，其余按最近更新排序
  return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
}

/** 置顶 / 取消置顶 */
export function setPinned(id: string, pinned: boolean) {
  const list = listConversations().map((c) => (c.id === id ? { ...c, pinned: pinned || undefined } : c));
  writeIndex(list);
  emit();
}

/**
 * 设置 / 更换分组。传空串或 null 表示移出分组。
 * 分组名会去除首尾空白并截断到 20 字；全空白视为移出。
 */
export function setConversationGroup(id: string, group: string | null): string | null {
  const next = group?.replace(/\s+/g, " ").trim().slice(0, 20) || null;
  const list = listConversations().map((c) => (c.id === id ? { ...c, group: next ?? undefined } : c));
  writeIndex(list);
  emit();
  return next;
}

export function getActiveId(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveId(id: string | null) {
  if (!isBrowser()) return;
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
  emit();
}

export function subscribe(fn: () => void): () => void {
  if (!isBrowser()) return () => undefined;
  window.addEventListener(CHANGE_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(CHANGE_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "新对话";
  return clean.length > 26 ? `${clean.slice(0, 26)}…` : clean;
}

export function createConversation(title = "新对话"): ConversationMeta {
  const now = Date.now();
  const meta: ConversationMeta = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2, 10)}`,
    title,
    createdAt: now,
    updatedAt: now,
    count: 0,
  };
  const list = [meta, ...listConversations()];
  // 超出上限时把最老会话的正文一起清掉，避免占满配额（置顶会话不淘汰）
  const overflow = list.filter((c) => !c.pinned).slice(MAX_CONVERSATIONS);
  if (overflow.length) {
    for (const old of overflow) localStorage.removeItem(MSG_PREFIX + old.id);
  }
  writeIndex(list.slice(0, MAX_CONVERSATIONS));
  emit();
  return meta;
}

/**
 * 重命名会话。空标题视为取消，直接返回 false。
 * 打上 customTitle 标记，避免下一轮对话把用户改的名字冲掉。
 */
export function renameConversation(id: string, title: string): boolean {
  const next = title.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!next) return false;
  const list = listConversations().map((c) => (c.id === id ? { ...c, title: next, customTitle: true } : c));
  writeIndex(list);
  emit();
  return true;
}

export function deleteConversation(id: string) {
  const list = listConversations().filter((c) => c.id !== id);
  writeIndex(list);
  try {
    localStorage.removeItem(MSG_PREFIX + id);
  } catch {
    /* 忽略 */
  }
  if (getActiveId() === id) setActiveId(null);
  else emit();
}

export function loadMessages(id: string): ChatMessage[] {
  if (!isBrowser()) return [];
  const raw = safeParse<ChatMessage[]>(localStorage.getItem(MSG_PREFIX + id), []);
  return Array.isArray(raw) ? raw.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") : [];
}

/** 写入会话正文，并同步更新索引里的标题（取第一条提问）、条数与更新时间 */
export function saveMessages(id: string, messages: ChatMessage[]) {
  if (!isBrowser() || messages.length === 0) return;
  const serialized = JSON.stringify(messages);
  let unchanged = false;
  try {
    unchanged = localStorage.getItem(MSG_PREFIX + id) === serialized;
    if (!unchanged) localStorage.setItem(MSG_PREFIX + id, serialized);
  } catch {
    return;
  }

  const list = listConversations();
  const idx = list.findIndex((c) => c.id === id);
  // 内容没变（例如仅选中/切换会话时的回写）就别刷新 updatedAt，否则会话会被排到列表最前
  if (unchanged && idx >= 0) return;

  const firstUser = messages.find((m) => m.role === "user");
  const prev = idx >= 0 ? list[idx] : null;
  // 用户手动改过名字就保留，否则跟随首条提问自动生成
  const title = prev?.customTitle ? prev.title : firstUser ? titleFromText(firstUser.content) : "新对话";
  const meta: ConversationMeta = {
    id,
    title,
    createdAt: prev ? prev.createdAt : Date.now(),
    updatedAt: Date.now(),
    count: messages.length,
    customTitle: prev?.customTitle,
    pinned: prev?.pinned,
    group: prev?.group,
  };

  if (idx >= 0) list[idx] = meta;
  else list.unshift(meta);
  writeIndex(list);
  emit();
}

/** 旧版本只有一个会话（lrag:chat:v1），首次打开时迁移成一条历史记录 */
export function migrateLegacyHistory(): void {
  if (!isBrowser()) return;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  const legacy = safeParse<ChatMessage[]>(raw, []);
  if (Array.isArray(legacy) && legacy.length > 0 && listConversations().length === 0) {
    const meta = createConversation(titleFromText(legacy.find((m) => m.role === "user")?.content ?? "历史对话"));
    saveMessages(meta.id, legacy);
    setActiveId(meta.id);
  }
  localStorage.removeItem(LEGACY_KEY);
}

export function formatRelativeTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
