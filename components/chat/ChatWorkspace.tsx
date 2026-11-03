"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, ChatMessage, Role } from "@/lib/types";
import {
  createConversation,
  getActiveId,
  listConversations,
  loadMessages,
  saveMessages,
  setActiveId,
  subscribe,
  titleFromText,
} from "@/lib/conversations";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";
import { enabledPluginIds, isPluginEnabled, takePluginDraft, usePlugins } from "@/lib/plugins/client";
import type { PluginMeta } from "@/lib/plugins/types";

const DONE_TITLE = "✓ 回答已完成 · ZDY Agent";

const SUGGESTIONS = [
  { title: "知识库里都收录了哪些资料？", desc: "先看看已入库的文档清单" },
  { title: "帮我总结核心产品的定价方案", desc: "基于文档做结构化归纳" },
  { title: "新员工入职需要准备什么材料？", desc: "检索制度类文档并给出清单" },
  { title: "这个流程有哪些风险和注意事项？", desc: "跨片段检索后做要点提炼" },
];

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ChatWorkspace() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [llmReady, setLlmReady] = useState(true);
  const [hints, setHints] = useState<string[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  /** 用户在输入框里显式指定的插件 */
  const [pendingPlugin, setPendingPlugin] = useState<PluginMeta | null>(null);

  const { plugins } = usePlugins();
  const pluginsRef = useRef<PluginMeta[]>([]);
  pluginsRef.current = plugins;
  /** 插件页点「用这个」跳转过来时，待消费的模板 */
  const draftRef = useRef<{ pluginId: string; template: string } | null>(null);
  const draftTakenRef = useRef(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const startedAtRef = useRef(0);
  const baseTitleRef = useRef("");
  const activeIdRef = useRef<string | null>(null);
  /** 刚创建、需要保留当前消息而不要去存储回读的会话 id */
  const skipLoadRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<{ id: string | null; messages: ChatMessage[] }>({ id: null, messages: [] });

  const streaming = streamingId !== null;

  const activeTitle = useMemo(
    () => (activeId ? listConversations().find((c) => c.id === activeId)?.title ?? "新对话" : "新对话"),
    // messages 变化时标题可能才写入索引（首条提问），这里一并刷新
    [activeId, messages]
  );

  /** 立即把待落盘的消息写入（切换会话 / 卸载时用，避免丢掉最后几百毫秒的内容） */
  const flushSave = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const { id, messages: pending } = latestRef.current;
    if (id && pending.length > 0) saveMessages(id, pending);
  }, []);

  // 消费插件页交接过来的模板：插件清单是异步加载的，晚一拍再匹配
  useEffect(() => {
    if (!draftTakenRef.current) {
      draftTakenRef.current = true;
      const draft = takePluginDraft();
      if (draft) {
        draftRef.current = draft;
        setInput(draft.template.replace(/\{\{input\}\}/g, ""));
      }
    }
    if (!draftRef.current) return;
    const plugin = plugins.find((p) => p.id === draftRef.current?.pluginId);
    if (plugin) {
      setPendingPlugin(plugin);
      draftRef.current = null;
    }
  }, [plugins]);

  // 初始化：配置状态 + 会话同步（侧边栏切换、删除、新建都会广播到此处）
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        setLlmReady(Boolean(d?.llm?.configured));
        setHints(Array.isArray(d?.hints) ? d.hints : []);
      })
      .catch(() => setLlmReady(false));

    const sync = () => {
      const id = getActiveId();
      if (id === activeIdRef.current) return;
      abortRef.current?.abort();
      flushSave();
      setStreamingId(null);
      activeIdRef.current = id;
      setActiveIdState(id);
    };
    sync();
    return subscribe(sync);
  }, [flushSave]);

  // 切换会话时装载历史消息（刚新建的会话跳过，避免覆盖刚发出的消息）
  useEffect(() => {
    if (skipLoadRef.current && skipLoadRef.current === activeId) {
      skipLoadRef.current = null;
      return;
    }
    if (!activeId) {
      setMessages([]);
      return;
    }
    setMessages(loadMessages(activeId));
  }, [activeId]);

  // 消息变化后延迟落盘，避免流式过程中每个 token 都写一次
  useEffect(() => {
    latestRef.current = { id: activeId, messages };
    if (!activeId || messages.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveMessages(activeId, messages);
    }, 300);
  }, [activeId, messages]);

  // 卸载前把未落盘的内容补写
  useEffect(() => () => flushSave(), [flushSave]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingId]);

  // 页面在后台时用标题提示「回答已写完」，回到页面自动还原
  useEffect(() => {
    baseTitleRef.current = document.title;
    const restore = () => {
      if (!document.hidden && baseTitleRef.current) document.title = baseTitleRef.current;
    };
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("focus", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("focus", restore);
    };
  }, []);

  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  /** 把一次对话请求跑完：流式消费事件、记录工具轨迹与来源，收尾时补上耗时 */
  const runAssistant = useCallback(
    async (assistantId: string, history: { role: Role; content: string }[], focusPlugin: string | null = null) => {
      const controller = new AbortController();
      abortRef.current = controller;
      startedAtRef.current = Date.now();
      let failed = false;

      const applyEvent = (event: AgentEvent) => {
        switch (event.type) {
          case "delta":
            patch(assistantId, (m) => ({ ...m, content: m.content + event.text }));
            break;
          case "tool_start":
            patch(assistantId, (m) => ({
              ...m,
              tools: [
                ...(m.tools ?? []),
                { id: event.id, name: event.name, label: event.label, args: event.args, status: "running" as const },
              ],
            }));
            break;
          case "tool_end":
            patch(assistantId, (m) => ({
              ...m,
              tools: (m.tools ?? []).map((t) =>
                t.id === event.id ? { ...t, status: event.ok ? ("done" as const) : ("error" as const), summary: event.summary } : t
              ),
            }));
            break;
          case "sources":
            patch(assistantId, (m) => ({ ...m, sources: event.sources }));
            break;
          case "error":
            failed = true;
            patch(assistantId, (m) => ({ ...m, error: event.message }));
            break;
          default:
            break;
        }
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            plugins: enabledPluginIds(pluginsRef.current),
            focusPlugin,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          failed = true;
          throw new Error(data?.error ?? `请求失败（HTTP ${res.status}）`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const line = block.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let event: AgentEvent;
            try {
              event = JSON.parse(line.slice(5).trim()) as AgentEvent;
            } catch {
              continue;
            }
            applyEvent(event);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          failed = true;
          patch(assistantId, (m) => ({ ...m, error: (err as Error).message }));
        }
      } finally {
        setStreamingId(null);
        abortRef.current = null;
        patch(assistantId, (m) => ({ ...m, durationMs: m.durationMs ?? Date.now() - startedAtRef.current }));
        if (!failed && document.hidden) document.title = DONE_TITLE;
      }
    },
    [patch]
  );

  const send = useCallback(
    async (raw?: string) => {
      const content = (raw ?? input).trim();
      if (!content || streamingId) return;

      // 草稿态：第一次提问时才真正落成一个会话，标题取提问内容
      let convId = activeId;
      if (!convId) {
        const meta = createConversation(titleFromText(content));
        convId = meta.id;
        skipLoadRef.current = meta.id;
        activeIdRef.current = meta.id;
        setActiveIdState(meta.id);
        setActiveId(meta.id);
      }

      const userMessage: ChatMessage = { id: uid(), role: "user", content, createdAt: Date.now() };
      const assistantId = uid();
      const history = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as Role, content },
      ];

      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: "assistant", content: "", tools: [], createdAt: Date.now() },
      ]);
      setInput("");
      setStreamingId(assistantId);
      pinnedRef.current = true;

      const focus = pendingPlugin && isPluginEnabled(pendingPlugin) ? pendingPlugin.id : null;
      setPendingPlugin(null);

      await runAssistant(assistantId, history, focus);
    },
    [activeId, input, messages, pendingPlugin, runAssistant, streamingId]
  );

  /** 重新生成：回到该回答对应的提问处，丢弃其后的内容再跑一次 */
  const regenerate = useCallback(
    async (id: string) => {
      if (streamingId) return;
      const idx = messages.findIndex((m) => m.id === id);
      if (idx < 1) return;

      let userIdx = -1;
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (messages[i].role === "user") {
          userIdx = i;
          break;
        }
      }
      if (userIdx === -1) return;

      const history = messages.slice(0, userIdx + 1).map((m) => ({ role: m.role, content: m.content }));
      const fresh: ChatMessage = { id: uid(), role: "assistant", content: "", tools: [], createdAt: Date.now() };

      setMessages((prev) => [...prev.slice(0, userIdx + 1), fresh]);
      setStreamingId(fresh.id);
      pinnedRef.current = true;

      await runAssistant(fresh.id, history);
    },
    [messages, runAssistant, streamingId]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (streamingId) {
      patch(streamingId, (m) => ({
        ...m,
        stopped: true,
        durationMs: m.durationMs ?? (startedAtRef.current ? Date.now() - startedAtRef.current : undefined),
      }));
    }
    setStreamingId(null);
  }, [patch, streamingId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  return (
    <div className="chat">
      <header className="chat-header">
        <div>
          <h2>对话</h2>
          <p>{activeId ? `当前会话 · ${activeTitle}` : "新建对话开始提问 · Ctrl + K 搜索历史"}</p>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            </div>
            <h1>基于你的文档回答问题</h1>
            <p>
              提问后，Agent 会先调用检索工具在知识库中找依据，再组织答案，并把命中的原文片段作为引用列在下方。
            </p>
            <div className="suggests">
              {SUGGESTIONS.map((s) => (
                <button className="suggest" key={s.title} onClick={() => send(s.title)}>
                  <strong>{s.title}</strong>
                  <span>{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-inner">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                streaming={streamingId === m.id}
                onRegenerate={m.role === "assistant" ? regenerate : undefined}
                regenerateDisabled={streaming}
              />
            ))}
          </div>
        )}
      </div>

      <div className="composer-dock">
        {!llmReady || hints.length > 0 ? (
          <div className="banner">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginTop: 2, flex: "0 0 auto" }}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
            </svg>
            <div>
              {hints.length > 0 ? (
                hints.map((h) => <div key={h}>{h}</div>)
              ) : (
                <>
                  还没有配置模型密钥。把 <code>.env.example</code> 复制为 <code>.env.local</code>，填入{" "}
                  <code>OPENAI_API_KEY</code> 与 <code>EMBEDDING_API_KEY</code>，然后重启 <code>npm run dev</code>。
                </>
              )}
              <div style={{ marginTop: 4, opacity: 0.75 }}>
                改完可以执行 <code>npm run doctor</code> 一次性检查密钥、模型名和工具调用能力。
              </div>
            </div>
          </div>
        ) : null}

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send()}
          onStop={stop}
          streaming={streaming}
          plugins={plugins}
          pendingPlugin={pendingPlugin}
          onPickCommand={(plugin) => setPendingPlugin(plugin)}
          onClearPending={() => setPendingPlugin(null)}
        />
        <div className="composer-hint">
          输入 <code>/</code> 或点左侧插件按钮快速调用 · Enter 发送 · Shift + Enter 换行 · 答案由模型生成，关键信息请核对原文
        </div>
      </div>
    </div>
  );
}
