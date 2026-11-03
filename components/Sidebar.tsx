"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserMenu } from "@/components/UserMenu";
import { SearchModal } from "@/components/SearchModal";
import {
  type ConversationMeta,
  deleteConversation,
  formatRelativeTime,
  getActiveId,
  listConversations,
  migrateLegacyHistory,
  setActiveId,
  subscribe,
} from "@/lib/conversations";
import { isPluginEnabled, usePlugins } from "@/lib/plugins/client";

interface Health {
  llm: { model: string; configured: boolean };
  embedding: { model: string; configured: boolean };
  knowledgeBase: { documents: number; chunks: number };
}

const BookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" strokeLinejoin="round" />
    <path d="M8 7h8M8 11h5" strokeLinecap="round" />
  </svg>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" strokeLinecap="round" />
  </svg>
);

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const PlugIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9 3v4M15 3v4" strokeLinecap="round" />
    <path d="M6 7h12v4a6 6 0 0 1-12 0V7Z" strokeLinejoin="round" />
    <path d="M12 17v4" strokeLinecap="round" />
  </svg>
);

const ChatSmallIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L4 21l1.6-4.2A8.5 8.5 0 1 1 21 12Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const { plugins } = usePlugins();
  const enabledCount = plugins.filter((p) => !p.error && isPluginEnabled(p)).length;

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: Health) => {
        if (alive) setHealth(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pathname]);

  useEffect(() => {
    migrateLegacyHistory();
    const sync = () => {
      setConversations(listConversations());
      setActive(getActiveId());
    };
    sync();
    return subscribe(sync);
  }, []);

  // Ctrl / Cmd + K 唤起全局搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startNewChat = () => {
    setActiveId(null);
    if (pathname !== "/") router.push("/");
  };

  const openConversation = (id: string) => {
    setActiveId(id);
    if (pathname !== "/") router.push("/");
  };

  return (
    <aside className="sidebar">
      <Link href="/" className="brand" title="回到对话" aria-label="回到对话页">
        <div className="brand-mark">Z</div>
        <div>
          <div className="brand-name">ZDY Agent</div>
          <div className="brand-sub">LangChain · RAG</div>
        </div>
      </Link>

      <div className="sidebar-top">
        <button type="button" className="new-chat-btn" onClick={startNewChat}>
          <PlusIcon />
          新建对话
        </button>
        <button
          type="button"
          className="search-btn"
          onClick={() => setSearchOpen(true)}
          title="搜索（Ctrl + K）"
          aria-label="搜索对话与文档"
        >
          <SearchIcon />
        </button>
      </div>

      <nav className="nav">
        <div className="nav-label">工作区</div>
        <Link href="/knowledge" className={pathname.startsWith("/knowledge") ? "active" : ""}>
          <BookIcon />
          知识库管理
        </Link>
        <Link href="/plugins" className={pathname.startsWith("/plugins") ? "active" : ""}>
          <PlugIcon />
          插件
          {enabledCount > 0 ? <span className="nav-badge">{enabledCount}</span> : null}
        </Link>
      </nav>

      <div className="recent">
        <div className="recent-head">
          <span>最近对话</span>
          {conversations.length > 0 ? <span className="recent-count">{conversations.length}</span> : null}
        </div>
        <div className="recent-list">
          {conversations.length === 0 ? (
            <div className="recent-empty">还没有历史对话，提问后会自动保存</div>
          ) : (
            conversations.map((c) => (
              <div key={c.id} className={`conv${c.id === activeId ? " active" : ""}`}>
                <button type="button" className="conv-open" onClick={() => openConversation(c.id)} title={c.title}>
                  <ChatSmallIcon />
                  <span className="conv-title">{c.title}</span>
                </button>
                <span className="conv-time">{formatRelativeTime(c.updatedAt)}</span>
                <button
                  type="button"
                  className="conv-del"
                  title="删除该对话"
                  aria-label={`删除对话：${c.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(c.id);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-bottom">
        <UserMenu health={health} />
      </div>

      {searchOpen ? <SearchModal onClose={() => setSearchOpen(false)} /> : null}
    </aside>
  );
}
