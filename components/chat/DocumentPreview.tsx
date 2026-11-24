"use client";

import { useEffect } from "react";

export interface PreviewTarget {
  id?: string;
  name: string;
  kind?: "file" | "image";
}

interface Props {
  target: PreviewTarget | null;
  onClose: () => void;
}

const INLINE_EXT = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "md", "csv", "json", "html", "htm", "xml"];

function extOf(name: string): string {
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

export function DocumentPreview({ target, onClose }: Props) {
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;

  const ext = extOf(target.name);
  const canInline = INLINE_EXT.includes(ext);
  const url = target.id ? `/api/files/${encodeURIComponent(target.id)}` : null;

  return (
    <>
      <div className="preview-backdrop" onMouseDown={onClose} />
      <aside className="preview-panel" role="dialog" aria-modal="true" aria-label={`预览 ${target.name}`}>
        <div className="preview-head">
          <div className="preview-title">
            <strong>{target.name}</strong>
            <span>{target.id ? "原文件预览" : "历史附件 · 原文件未保存"}</span>
          </div>
          <div className="preview-head-actions">
            {url ? (
              <a className="preview-download" href={url} download={target.name} title="下载文件">
                下载
              </a>
            ) : null}
            <button type="button" className="preview-close" onClick={onClose} aria-label="关闭预览" title="关闭">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="preview-body">
          {url && canInline ? (
            <iframe className="preview-frame" src={url} title={target.name} />
          ) : url ? (
            <div className="preview-fallback">
              <div className="preview-fallback-icon">📄</div>
              <strong>{target.name}</strong>
              <p>该格式暂不支持浏览器在线预览，请下载后查看。</p>
              <a className="preview-download large" href={url} download={target.name}>
                下载文件
              </a>
            </div>
          ) : (
            <div className="preview-fallback">
              <div className="preview-fallback-icon">📄</div>
              <strong>{target.name}</strong>
              <p>这条消息来自更早的会话，当时没有保留原文件，因此无法在线预览。</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
