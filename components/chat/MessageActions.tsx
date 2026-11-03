"use client";

import { useEffect, useRef, useState } from "react";
import type { Source } from "@/lib/types";

interface Props {
  content: string;
  sources?: Source[];
  stopped?: boolean;
  failed?: boolean;
  durationMs?: number;
  onRegenerate?: () => void;
  regenerateDisabled?: boolean;
}

function buildCopyText(content: string, sources?: Source[]): string {
  if (!sources?.length) return content;
  const list = sources.map((s, i) => `[${i + 1}] ${s.source} · 第 ${s.chunk + 1} 片段`).join("\n");
  return `${content}\n\n---\n引用来源：\n${list}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 非安全上下文时降级 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
    <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StopIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);

const WarnIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.6v.4" strokeLinecap="round" />
  </svg>
);

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="9" y="9" width="11" height="11" rx="2.4" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.4A2.4 2.4 0 0 0 4 5.4v6.1A2.5 2.5 0 0 0 6.5 14" strokeLinecap="round" />
  </svg>
);

const RetryIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
    <path d="M20 4.5V10h-5.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * 回答结束后的收尾条：既是「生成已结束」的显式状态标识，也承载复制 / 重新生成操作。
 * 流式过程中不渲染，因此它的出现本身就代表这条回答已经写完。
 */
export function MessageActions({
  content,
  sources,
  stopped = false,
  failed = false,
  durationMs,
  onRegenerate,
  regenerateDisabled = false,
}: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const reset = (next: "copied" | "failed") => {
    setCopyState(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopyState("idle"), 1800);
  };

  const onCopy = async () => {
    if (!content) return;
    const ok = await copyText(buildCopyText(content, sources));
    reset(ok ? "copied" : "failed");
  };

  const statusText = failed ? "生成失败" : stopped ? "已停止生成" : "已生成完成";
  const statusClass = failed ? " failed" : stopped ? " stopped" : "";
  const seconds = durationMs && durationMs > 500 ? (durationMs / 1000).toFixed(1) : null;

  return (
    <div className="msg-actions">
      <span className={`done-flag${statusClass}`}>
        {failed ? <WarnIcon /> : stopped ? <StopIcon /> : <CheckIcon />}
        {statusText}
      </span>
      {!failed && seconds ? <span className="done-meta">用时 {seconds}s</span> : null}
      {!failed && sources?.length ? (
        <>
          <span className="done-dot" />
          <span className="done-meta">引用 {sources.length} 条</span>
        </>
      ) : null}

      <div className="msg-btn-group">
        {content ? (
          <button
            type="button"
            className={`msg-btn${copyState === "idle" ? "" : ` ${copyState}`}`}
            onClick={onCopy}
            title={
              copyState === "failed"
                ? "复制失败，请手动选中文本复制"
                : sources?.length
                  ? "复制回答正文与引用来源"
                  : "复制回答正文"
            }
            aria-label="复制回答"
          >
            {copyState === "copied" ? <CheckIcon /> : copyState === "failed" ? <WarnIcon /> : <CopyIcon />}
            {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
          </button>
        ) : null}
        {onRegenerate ? (
          <button
            type="button"
            className="msg-btn"
            onClick={onRegenerate}
            disabled={regenerateDisabled}
            title="基于同一个问题重新生成回答"
            aria-label="重新生成回答"
          >
            <RetryIcon />
            重新生成
          </button>
        ) : null}
      </div>
    </div>
  );
}
