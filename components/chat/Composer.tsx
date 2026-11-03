"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PluginMeta } from "@/lib/plugins/types";
import { isPluginEnabled } from "@/lib/plugins/client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  /** 全部插件（含停用的），菜单里只展示已启用的 */
  plugins: PluginMeta[];
  /** 本次指定的插件，会随请求发给服务端做优先提示 */
  pendingPlugin: PluginMeta | null;
  onPickCommand: (plugin: PluginMeta, template: string) => void;
  onClearPending: () => void;
}

const PlugIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M9 3v4M15 3v4" strokeLinecap="round" />
    <path d="M6 7h12v4a6 6 0 0 1-12 0V7Z" strokeLinejoin="round" />
    <path d="M12 17v4" strokeLinecap="round" />
  </svg>
);

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  plugins,
  pendingPlugin,
  onPickCommand,
  onClearPending,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const enabled = plugins.filter((p) => !p.error && isPluginEnabled(p));
  /** 菜单条目：每个插件的命令 + 快捷提示词 */
  const entries = enabled.flatMap((p) => [
    ...p.commands.map((c) => ({
      plugin: p,
      key: `${p.id}:c:${c.name}`,
      title: c.title,
      hint: c.hint ?? "",
      badge: `/${c.name}`,
      text: c.template,
    })),
    ...p.prompts.map((t) => ({
      plugin: p,
      key: `${p.id}:p:${t.title}`,
      title: t.title,
      hint: t.description ?? "",
      badge: "提示词",
      text: t.prompt,
    })),
  ]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const canSend = value.trim().length > 0 && !streaming && !disabled;

  const pick = (plugin: PluginMeta, template: string) => {
    // 模板里的 {{input}} 是留给用户填空的位置：删掉标记后把光标停在那里
    const caret = template.indexOf("{{input}}");
    const text = template.replace(/\{\{input\}\}/g, "");
    onChange(text);
    onPickCommand(plugin, template);
    setOpen(false);
    window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const at = caret >= 0 ? caret : text.length;
      el.setSelectionRange(at, at);
    }, 0);
  };

  return (
    <div className="composer-wrap" ref={wrapRef}>
      {pendingPlugin ? (
        <div className="pending-chip">
          <span className="pending-icon">{pendingPlugin.icon}</span>
          <span className="pending-text">
            将优先使用 <strong>{pendingPlugin.name}</strong>
          </span>
          <button type="button" onClick={onClearPending} aria-label="取消指定插件" title="取消">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="plugin-menu" role="menu">
          <div className="pm-head">
            <span>插件</span>
            <span className="pm-count">{enabled.length} 个已启用</span>
          </div>
          {entries.length === 0 ? (
            <div className="pm-empty">
              还没有启用的插件。
              <Link href="/plugins" onClick={() => setOpen(false)}>
                去插件页开启 →
              </Link>
            </div>
          ) : (
            <div className="pm-list">
              {entries.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  role="menuitem"
                  className="pm-item"
                  onClick={() => pick(e.plugin, e.text)}
                >
                  <span className="pm-icon">{e.plugin.icon}</span>
                  <span className="pm-body">
                    <strong>
                      {e.title}
                      <span className="pm-badge">{e.badge}</span>
                    </strong>
                    {e.hint ? <em>{e.hint}</em> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Link href="/plugins" className="pm-foot" onClick={() => setOpen(false)}>
            管理插件与开关 →
          </Link>
        </div>
      ) : null}

      <div className="composer">
        <button
          type="button"
          className={`plug-btn${open ? " open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          title="使用插件"
          aria-label="使用插件"
        >
          <PlugIcon />
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder="问点什么，比如：报销流程有哪些步骤？"
          onChange={(e) => {
            const next = e.target.value;
            onChange(next);
            if (next === "/" && entries.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        {streaming ? (
          <button className="btn-send btn-stop" onClick={onStop} aria-label="停止生成" title="停止生成">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button className="btn-send" onClick={onSend} disabled={!canSend} aria-label="发送" title="发送">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
