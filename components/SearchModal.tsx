"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime, listConversations, loadMessages, setActiveId, type ConversationMeta } from "@/lib/conversations";

interface ConvHit {
  meta: ConversationMeta;
  /** 命中标题时为 null；命中正文时为带省略号的片段 */
  snippet: string | null;
}

interface DocHit {
  id: string;
  name: string;
  chunks: number;
}

const MAX_CONV_HITS = 20;

/** 把命中关键词的部分高亮出来 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (;;) {
    const idx = lower.indexOf(q, i);
    if (idx < 0) {
      if (i < text.length) parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(<mark key={idx}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
  }
  return <>{parts}</>;
}

function makeSnippet(content: string, q: string): string {
  const idx = content.toLowerCase().indexOf(q);
  if (idx < 0) return content.slice(0, 90);
  const start = Math.max(0, idx - 34);
  const end = Math.min(content.length, idx + q.length + 56);
  const body = content.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body}${end < content.length ? "…" : ""}`;
}

/** 遍历会话：标题命中直接收录，否则逐条翻正文找第一处命中 */
function searchConversations(q: string): ConvHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const hits: ConvHit[] = [];
  for (const meta of listConversations()) {
    if (hits.length >= MAX_CONV_HITS) break;
    if (meta.title.toLowerCase().includes(query)) {
      hits.push({ meta, snippet: null });
      continue;
    }
    const found = loadMessages(meta.id).find((m) => m.content.toLowerCase().includes(query));
    if (found) hits.push({ meta, snippet: makeSnippet(found.content, query) });
  }
  return hits;
}

function searchDocs(docs: DocHit[], q: string): DocHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return docs.filter((d) => d.name.toLowerCase().includes(query)).slice(0, 8);
}

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" strokeLinecap="round" />
  </svg>
);

const ChatSmallIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L4 21l1.6-4.2A8.5 8.5 0 1 1 21 12Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DocSmallIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" strokeLinejoin="round" />
  </svg>
);

export function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [docs, setDocs] = useState<DocHit[] | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 输入防抖，避免每敲一个字就翻全部会话正文
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 140);
    return () => clearTimeout(t);
  }, [query]);

  // 打开时拉一次文档清单（搜索文档名），并聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocs(Array.isArray(d?.documents) ? d.documents : []))
      .catch(() => setDocs([]));
  }, []);

  const convHits = useMemo(() => searchConversations(debounced), [debounced]);
  const docHits = useMemo(() => (docs ? searchDocs(docs, debounced) : []), [docs, debounced]);
  const total = convHits.length + docHits.length;

  useEffect(() => {
    setActive(0);
  }, [debounced]);

  const openConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      onClose();
      router.push("/");
    },
    [onClose, router]
  );

  const openKnowledge = useCallback(() => {
    onClose();
    router.push("/knowledge");
  }, [onClose, router]);

  const move = useCallback(
    (delta: number) => {
      if (total === 0) return;
      setActive((prev) => (prev + delta + total) % total);
    },
    [total]
  );

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < convHits.length) openConversation(convHits[active].meta.id);
      else if (active - convHits.length < docHits.length) openKnowledge();
    }
  };

  let cursor = 0;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="search-modal" role="dialog" aria-modal="true" aria-label="搜索">
        <div className="search-bar">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索对话内容、标题或知识库文档…"
            aria-label="搜索关键词"
          />
          <button type="button" className="search-esc" onClick={onClose} title="关闭">
            Esc
          </button>
        </div>

        <div className="search-results" ref={listRef}>
          {debounced.trim() === "" ? (
            <div className="search-empty">
              <SearchIcon />
              <div>输入关键词搜索历史对话与知识库文档</div>
              <div className="search-empty-sub">支持标题与正文全文匹配 · ↑↓ 选择 · Enter 打开</div>
            </div>
          ) : total === 0 ? (
            <div className="search-empty">
              <div>没有找到与「{debounced.trim()}」相关的内容</div>
            </div>
          ) : (
            <>
              {convHits.length > 0 ? <div className="search-group">对话</div> : null}
              {convHits.map((hit) => {
                const idx = cursor++;
                return (
                  <button
                    key={hit.meta.id}
                    type="button"
                    className={`search-item${idx === active ? " active" : ""}`}
                    data-active={idx === active || undefined}
                    onClick={() => openConversation(hit.meta.id)}
                    onMouseEnter={() => setActive(idx)}
                  >
                    <span className="search-item-icon">
                      <ChatSmallIcon />
                    </span>
                    <span className="search-item-body">
                      <span className="search-item-title">
                        <Highlight text={hit.meta.title} query={debounced} />
                      </span>
                      {hit.snippet ? (
                        <span className="search-item-snippet">
                          <Highlight text={hit.snippet} query={debounced} />
                        </span>
                      ) : null}
                    </span>
                    <span className="search-item-time">{formatRelativeTime(hit.meta.updatedAt)}</span>
                  </button>
                );
              })}

              {docHits.length > 0 ? <div className="search-group">知识库文档</div> : null}
              {docHits.map((d) => {
                const idx = cursor++;
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`search-item${idx === active ? " active" : ""}`}
                    data-active={idx === active || undefined}
                    onClick={openKnowledge}
                    onMouseEnter={() => setActive(idx)}
                  >
                    <span className="search-item-icon">
                      <DocSmallIcon />
                    </span>
                    <span className="search-item-body">
                      <span className="search-item-title">
                        <Highlight text={d.name} query={debounced} />
                      </span>
                      <span className="search-item-snippet">{d.chunks} 个片段 · 前往知识库管理</span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {!docs && debounced.trim() !== "" ? <div className="search-loading">正在加载知识库文档…</div> : null}
      </div>
    </div>
  );
}
