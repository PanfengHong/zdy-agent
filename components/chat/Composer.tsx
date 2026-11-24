"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PluginMeta } from "@/lib/plugins/types";
import { isPluginEnabled } from "@/lib/plugins/client";

export interface ComposerAttachment {
  id: string;
  name: string;
  kind: "file" | "image";
  /** 服务端保存的原文件 id，用于点击预览 */
  documentId?: string;
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
  previewUrl?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (attachments: ComposerAttachment[]) => void;
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

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M6 3h8l4 4v14H6V3Z" strokeLinejoin="round" />
    <path d="M14 3v5h5M9 13h6M9 17h6" strokeLinecap="round" />
  </svg>
);

const ImageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 17 5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RemoveIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  attachmentsRef.current = attachments;

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

  const patchAttachment = (id: string, patch: Partial<ComposerAttachment>) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const addFiles = async (files: FileList | null, kind: "file" | "image") => {
    if (!files || files.length === 0) return;
    setOpen(false);
    for (const file of Array.from(files).slice(0, 8)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (file.size > 20 * 1024 * 1024) {
        setAttachments((prev) => [...prev, { id, name: file.name, kind, status: "error", error: "超过 20MB" }]);
        continue;
      }
      if (kind === "image") {
        const previewUrl = URL.createObjectURL(file);
        setAttachments((prev) => [...prev, { id, name: file.name, kind, status: "uploading", previewUrl }]);
        const form = new FormData();
        form.append("files", file);
        try {
          const res = await fetch("/api/attachments", { method: "POST", body: form });
          const data = (await res.json().catch(() => null)) as
            | { error?: string; results?: { id?: string; ok: boolean; error?: string }[] }
            | null;
          const item = data?.results?.[0];
          if (res.ok && item?.ok && item.id) patchAttachment(id, { status: "ready", documentId: item.id });
          else {
            URL.revokeObjectURL(previewUrl);
            patchAttachment(id, {
              status: "error",
              error: item?.error ?? data?.error ?? "上传失败",
              previewUrl: undefined,
            });
          }
        } catch (err) {
          URL.revokeObjectURL(previewUrl);
          patchAttachment(id, { status: "error", error: (err as Error).message, previewUrl: undefined });
        }
        continue;
      }

      setAttachments((prev) => [...prev, { id, name: file.name, kind, status: "uploading" }]);
      const form = new FormData();
      form.append("files", file);
      try {
        const res = await fetch("/api/documents", { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as
          | { error?: string; results?: { id?: string; ok: boolean; error?: string }[] }
          | null;
        const item = data?.results?.[0];
        if (res.ok && item?.ok) patchAttachment(id, { status: "done", documentId: item.id });
        else patchAttachment(id, { status: "error", error: item?.error ?? data?.error ?? "上传失败" });
      } catch (err) {
        patchAttachment(id, { status: "error", error: (err as Error).message });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
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

  const activeAttachments = attachments.filter((a) => a.status !== "error");
  const canSend =
    (value.trim().length > 0 || activeAttachments.length > 0) &&
    !streaming &&
    !disabled &&
    !attachments.some((a) => a.status === "uploading");

  const handleSend = () => {
    if (!canSend) return;
    for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    onSend(activeAttachments);
    setAttachments([]);
  };

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
        {attachments.length > 0 ? (
          <div className="attachment-list">
            {attachments.map((a) => (
              <div
                key={a.id}
                className={`attachment-chip${a.status === "error" ? " error" : ""}`}
                title={a.error ?? a.name}
              >
                {a.kind === "image" && a.previewUrl ? (
                  <img className="attachment-thumb" src={a.previewUrl} alt="" />
                ) : (
                  <span className="attachment-icon">{a.kind === "image" ? <ImageIcon /> : <FileIcon />}</span>
                )}
                <span className="attachment-name">{a.name}</span>
                {a.status === "uploading" ? <span className="attachment-status">上传中…</span> : null}
                {a.status === "done" ? <span className="attachment-status done">已入库</span> : null}
                {a.status === "error" ? <span className="attachment-status error">{a.error}</span> : null}
                <button
                  type="button"
                  className="attachment-remove"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={`移除 ${a.name}`}
                  title="移除"
                >
                  <RemoveIcon />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <textarea
          ref={ref}
          rows={3}
          value={value}
          placeholder="问点什么，比如：报销流程有哪些步骤？Shift + Enter 换行"
          onChange={(e) => {
            const next = e.target.value;
            onChange(next);
            if (next === "/" && entries.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <div className="composer-actions">
          <div className="composer-tools">
            <button
              type="button"
              className={`plug-btn${open ? " open" : ""}`}
              onClick={() => setOpen((v) => !v)}
              title="使用插件"
              aria-label="使用插件"
            >
              <PlugIcon />
            </button>
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="上传文件到知识库"
              aria-label="上传文件"
            >
              <FileIcon />
            </button>
            <button
              type="button"
              className="attach-btn"
              onClick={() => imageInputRef.current?.click()}
              title="添加图片"
              aria-label="添加图片"
            >
              <ImageIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept=".pdf,.docx,.md,.txt,.csv,.json,.html,.htm,.xml,.yaml,.yml,.log,.tsv,.ini,.conf"
              onChange={(e) => addFiles(e.target.files, "file")}
            />
            <input
              ref={imageInputRef}
              type="file"
              hidden
              multiple
              accept="image/*"
              onChange={(e) => addFiles(e.target.files, "image")}
            />
          </div>
          {streaming ? (
            <button className="btn-send btn-stop" onClick={onStop} aria-label="停止生成" title="停止生成">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button className="btn-send" onClick={handleSend} disabled={!canSend} aria-label="发送" title="发送">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
