"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserMenu } from "@/components/UserMenu";
import { SearchModal } from "@/components/SearchModal";
import {
  type ConversationMeta,
  deleteConversation,
  formatRelativeTime,
  getActiveId,
  listConversations,
  migrateLegacyHistory,
  renameConversation,
  setActiveId,
  setConversationGroup,
  setPinned,
  subscribe,
} from "@/lib/conversations";
import { isPluginEnabled, usePlugins } from "@/lib/plugins/client";

const SIDEBAR_COLLAPSED_KEY = "zdy:sidebar-collapsed:v1";

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

const SidebarToggleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M9 4v16" />
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

const MoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5.5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="18.5" cy="12" r="1.6" />
  </svg>
);

const RenameIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" strokeLinejoin="round" />
    <path d="m13.5 6.5 4 4" strokeLinecap="round" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 11v6M14 11v6" strokeLinecap="round" />
  </svg>
);

const PinIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 17v5" strokeLinecap="round" />
    <path
      d="M12 3l2.2 3.6 4 .8-2.7 3.1.6 4-4.1-1.7-4.1 1.7.6-4L5.8 7.4l4-.8L12 3Z"
      strokeLinejoin="round"
    />
  </svg>
);

const FolderIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="m4.5 12.5 5 5 10-11" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BackIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
);

const LocateIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" strokeLinecap="round" />
  </svg>
);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  /** 当前展开「更多」菜单的会话 id、面板类型与弹层锚点（固定定位，避开列表滚动裁切） */
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; up: boolean; panel: "main" | "group" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [groupDraft, setGroupDraft] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 当前对话所在行，用于「定位」滚动与可见性判断 */
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  /** 当前对话是否滚出了列表可视区（决定是否显示定位按钮） */
  const [activeAway, setActiveAway] = useState(false);
  /** 定位后短暂高亮的目标会话 */
  const [flashId, setFlashId] = useState<string | null>(null);

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

  // 收起状态在挂载后读取（服务端渲染拿不到 localStorage）
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* 存储不可用时保持默认展开 */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* 忽略存储失败 */
      }
      return next;
    });
  };

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

  /**
   * 追踪当前对话是否滚出列表可视区：滚动、窗口尺寸变化、列表内容变化时重新判断。
   * 只有「行完全不在可视区内」才显示定位按钮，避免正常浏览时按钮晃来晃去。
   */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let raf = 0;
    const measure = () => {
      const row = activeRowRef.current;
      if (!row) {
        setActiveAway(false);
        return;
      }
      const listRect = list.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      setActiveAway(rowRect.top < listRect.top - 2 || rowRect.bottom > listRect.bottom + 2);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    list.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      list.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [conversations, activeId, editingId]);

  /** 把当前对话滚到列表中部并短暂高亮，便于在长列表里一眼找到 */
  const locateActive = () => {
    const list = listRef.current;
    const row = activeRowRef.current;
    if (!list || !row) return;
    const delta = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const top = list.scrollTop + delta - list.clientHeight / 2 + row.offsetHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    if (activeId) {
      const id = activeId;
      setFlashId(id);
      window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1300);
    }
  };

  /**
   * 弹层定位：以触发按钮为锚，优先向上弹（bottom 锚定，面板增高时自然向上生长），
   * 放不下再向下弹。y 记录按钮上/下缘的视口坐标。
   */
  const MENU_W = 150;

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8));
    const up = rect.top - 150 > 8;
    const y = up ? rect.top : rect.bottom;
    setMenu((prev) => (prev?.id === id && prev.panel === "main" ? null : { id, x, y, up, panel: "main" }));
  };

  /** 在同一位置把面板切到分组选择，不改变锚点 */
  const openGroupPanel = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const target = conversations.find((c) => c.id === menu?.id);
    setGroupDraft("");
    setMenu((prev) => (prev ? { ...prev, panel: "group" } : prev));
    if (target) setTimeout(() => groupRef.current?.focus(), 0);
  };

  // 菜单打开时：Esc 关闭，滚动 / 窗口尺寸变化也要收起，避免弹层飘在错误位置
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  // 进入重命名态后自动聚焦并全选，方便直接覆盖输入
  useEffect(() => {
    if (!editingId) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingId]);

  const beginRename = (c: ConversationMeta) => {
    setMenu(null);
    setEditingId(c.id);
    setDraft(c.title);
  };

  const commitRename = () => {
    if (!editingId) return;
    renameConversation(editingId, draft); // 空标题会被忽略，保留原名
    setEditingId(null);
  };

  const openConversation = (id: string) => {
    setActiveId(id);
    if (pathname !== "/") router.push("/");
  };

  // 列表分区：置顶 → 各分组（按组内最近更新排序）→ 未分组
  const pinnedList = conversations.filter((c) => c.pinned);
  const rest = conversations.filter((c) => !c.pinned);
  const groupNames: string[] = [];
  const byGroup = new Map<string, ConversationMeta[]>();
  for (const c of rest) {
    if (!c.group) continue;
    if (!byGroup.has(c.group)) {
      byGroup.set(c.group, []);
      groupNames.push(c.group);
    }
    byGroup.get(c.group)!.push(c);
  }
  const ungrouped = rest.filter((c) => !c.group);
  const hasSections = pinnedList.length > 0 || groupNames.length > 0;
  // 分组面板里可选择的分组：所有会话出现过的分组名（去重，按最近出现排序）
  const allGroupNames = Array.from(new Set(conversations.map((c) => c.group).filter((g): g is string => Boolean(g))));

  const renderConv = (c: ConversationMeta) => (
    <div
      key={c.id}
      ref={c.id === activeId ? (el) => { activeRowRef.current = el; } : undefined}
      className={`conv${c.pinned ? " pinned" : ""}${c.id === activeId ? " active" : ""}${menu?.id === c.id ? " menu-open" : ""}${flashId === c.id ? " flash" : ""}`}
    >
      {editingId === c.id ? (
        <div className="conv-editing">
          <ChatSmallIcon />
          <input
            ref={editRef}
            className="conv-rename"
            value={draft}
            maxLength={60}
            placeholder="输入新的对话名称"
            aria-label="重命名对话"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingId(null);
              }
            }}
          />
        </div>
      ) : (
        <>
          <button type="button" className="conv-open" onClick={() => openConversation(c.id)} title={c.title}>
            {c.pinned ? <PinIcon /> : <ChatSmallIcon />}
            <span className="conv-title">{c.title}</span>
            {/* 置顶会话脱离分组分区展示，用徽标保留分组归属信息 */}
            {c.pinned && c.group ? <span className="conv-group-tag">{c.group}</span> : null}
          </button>
          <span className="conv-time">{formatRelativeTime(c.updatedAt)}</span>
          <button
            type="button"
            className={`conv-more${menu?.id === c.id ? " open" : ""}`}
            title="更多操作"
            aria-label={`更多操作：${c.title}`}
            aria-haspopup="menu"
            aria-expanded={menu?.id === c.id}
            onClick={(e) => openMenu(e, c.id)}
          >
            <MoreIcon />
          </button>
        </>
      )}
    </div>
  );

  const renderSection = (label: string, items: ConversationMeta[]) =>
    items.length > 0 ? (
      <div className="conv-section" key={label}>
        <div className="conv-section-head">{label}</div>
        {items.map(renderConv)}
      </div>
    ) : null;

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="brand-row">
        <Link href="/" className="brand" title="回到对话" aria-label="回到对话页">
          <div className="brand-mark">Z</div>
          {!collapsed ? (
            <div>
              <div className="brand-name">ZDY Agent</div>
              <div className="brand-sub">LangChain · RAG</div>
            </div>
          ) : null}
        </Link>
        <div className="brand-actions">
          <button
            type="button"
            className="search-btn"
            onClick={() => setSearchOpen(true)}
            title="搜索（Ctrl + K）"
            aria-label="搜索对话与文档"
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            className="collapse-btn"
            onClick={toggleCollapsed}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!collapsed}
          >
            <SidebarToggleIcon />
          </button>
        </div>
      </div>

      {!collapsed ? (
        <>
          <div className="sidebar-top">
            <button type="button" className="new-chat-btn" onClick={startNewChat}>
              <PlusIcon />
              新建对话
            </button>
          </div>

          <nav className="nav">
            <div className="nav-label">工作区</div>
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
              {activeAway ? (
                <button
                  type="button"
                  className="locate-btn"
                  onClick={locateActive}
                  title="定位到当前对话"
                  aria-label="定位到当前对话"
                >
                  <LocateIcon />
                  定位
                </button>
              ) : null}
            </div>
            <div className="recent-list" ref={listRef}>
              {conversations.length === 0 ? (
                <div className="recent-empty">还没有历史对话，提问后会自动保存</div>
              ) : (
                <>
                  {renderSection("置顶", pinnedList)}
                  {groupNames.map((g) => renderSection(g, byGroup.get(g)!))}
                  {ungrouped.length > 0 ? (
                    hasSections ? renderSection("对话", ungrouped) : ungrouped.map(renderConv)
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="sidebar-bottom">
            <UserMenu health={health} />
          </div>
        </>
      ) : (
        <div className="rail-actions">
          <button
            type="button"
            className="rail-btn"
            onClick={startNewChat}
            title="新建对话"
            aria-label="新建对话"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className={`rail-btn${pathname.startsWith("/plugins") ? " active" : ""}`}
            onClick={() => router.push("/plugins")}
            title="插件"
            aria-label="插件"
          >
            <PlugIcon />
          </button>
        </div>
      )}

      {searchOpen ? <SearchModal onClose={() => setSearchOpen(false)} /> : null}

      {/* 会话「更多」菜单：挂到 body 上，避免被最近对话列表的滚动容器裁切 */}
      {menu && typeof document !== "undefined"
        ? createPortal(
            (() => {
              const target = conversations.find((c) => c.id === menu.id);
              const style: React.CSSProperties = menu.up
                ? { left: menu.x, bottom: Math.max(8, window.innerHeight - menu.y + 6) }
                : { left: menu.x, top: menu.y + 6 };
              return (
                <>
                  <div className="conv-menu-mask" onMouseDown={() => setMenu(null)} />
                  {menu.panel === "main" ? (
                    <div className="conv-menu" role="menu" aria-label="对话操作" style={style}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          const id = menu.id;
                          setMenu(null);
                          if (target) setPinned(id, !target.pinned);
                        }}
                      >
                        <PinIcon />
                        {target?.pinned ? "取消置顶" : "置顶"}
                      </button>
                      <button type="button" role="menuitem" onClick={openGroupPanel}>
                        <FolderIcon />
                        分组
                      </button>
                      <div className="conv-menu-sep" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          const t = conversations.find((c) => c.id === menu.id);
                          if (t) beginRename(t);
                          else setMenu(null);
                        }}
                      >
                        <RenameIcon />
                        重命名
                      </button>
                      <div className="conv-menu-sep" />
                      <button
                        type="button"
                        role="menuitem"
                        className="danger"
                        onClick={() => {
                          const id = menu.id;
                          setMenu(null);
                          deleteConversation(id);
                        }}
                      >
                        <TrashIcon />
                        删除
                      </button>
                    </div>
                  ) : (
                    <div className="conv-menu conv-menu-group" role="menu" aria-label="移动到分组" style={style}>
                      <div className="conv-menu-head">
                        <button
                          type="button"
                          className="conv-menu-back"
                          aria-label="返回上一级"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenu((prev) => (prev ? { ...prev, panel: "main" } : prev));
                          }}
                        >
                          <BackIcon />
                        </button>
                        <span>移动到分组</span>
                      </div>
                      <div className="conv-menu-groups">
                        {allGroupNames.length === 0 ? <div className="conv-menu-hint">还没有分组</div> : null}
                        {allGroupNames.map((g) => (
                          <button
                            key={g}
                            type="button"
                            role="menuitem"
                            className={target?.group === g ? "current" : ""}
                            onClick={() => {
                              setConversationGroup(menu.id, g);
                              setMenu(null);
                            }}
                          >
                            <FolderIcon />
                            <span className="conv-menu-group-name">{g}</span>
                            {target?.group === g ? <CheckIcon /> : null}
                          </button>
                        ))}
                        {target?.group ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setConversationGroup(menu.id, null);
                              setMenu(null);
                            }}
                          >
                            <CloseIcon />
                            移出分组
                          </button>
                        ) : null}
                      </div>
                      <div className="conv-menu-sep" />
                      <form
                        className="conv-new-group"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!groupDraft.trim() || !target) return;
                          setConversationGroup(menu.id, groupDraft);
                          setMenu(null);
                        }}
                      >
                        <input
                          ref={groupRef}
                          value={groupDraft}
                          maxLength={20}
                          placeholder="新建分组"
                          aria-label="新建分组名称"
                          onChange={(e) => setGroupDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenu((prev) => (prev ? { ...prev, panel: "main" } : prev));
                            }
                          }}
                        />
                        <button type="submit" disabled={!groupDraft.trim()}>
                          确定
                        </button>
                      </form>
                    </div>
                  )}
                </>
              );
            })(),
            document.body
          )
        : null}
    </aside>
  );
}
