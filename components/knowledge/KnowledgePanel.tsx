"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocMeta } from "@/lib/types";

interface UploadResult {
  name: string;
  ok: boolean;
  chunks?: number;
  chars?: number;
  replaced?: boolean;
  error?: string;
}

export function KnowledgePanel() {
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [stats, setStats] = useState({ documents: 0, chunks: 0, chars: 0 });
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json();
      setDocuments(data.documents ?? []);
      setStats(data.stats ?? { documents: 0, chunks: 0, chars: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setResults([]);
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      try {
        const res = await fetch("/api/documents", { method: "POST", body: form });
        const data = await res.json();
        if (Array.isArray(data.results)) setResults(data.results);
        else if (data.error) {
          const message = [data.error, ...((data.hints as string[] | undefined) ?? [])].join(" ");
          setResults(files.map((f) => ({ name: f.name, ok: false, error: message })));
        }
        await load();
      } catch (err) {
        setResults(files.map((f) => ({ name: f.name, ok: false, error: (err as Error).message })));
      } finally {
        setUploading(false);
      }
    },
    [load]
  );

  const remove = useCallback(
    async (doc: DocMeta) => {
      if (!window.confirm(`确认删除「${doc.name}」及其 ${doc.chunks} 个向量片段？`)) return;
      await fetch(`/api/documents?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      await load();
    },
    [load]
  );

  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="page-title">知识库</h1>
        <p className="page-desc">
          上传公司文档、产品资料、制度文件，系统会自动解析、切分、向量化并写入本地索引。同名文件重新上传会覆盖旧索引。
        </p>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">文档数</div>
            <div className="stat-value">{stats.documents}</div>
          </div>
          <div className="stat">
            <div className="stat-label">向量片段</div>
            <div className="stat-value">{stats.chunks}</div>
          </div>
          <div className="stat">
            <div className="stat-label">总字数</div>
            <div className="stat-value">{stats.chars.toLocaleString("zh-CN")}</div>
          </div>
        </div>

        <div
          className={`dropzone${drag ? " drag" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void upload(Array.from(e.dataTransfer.files));
          }}
        >
          <strong>{uploading ? "正在解析并向量化…" : "点击或拖拽文件到此处上传"}</strong>
          <span>支持 PDF · DOCX · Markdown · TXT · CSV · JSON · HTML，单文件最大 20MB</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.docx,.md,.txt,.csv,.json,.html"
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        {results.length > 0 ? (
          <div className="upload-status">
            {results.map((r, i) => (
              <div className={`upload-item ${r.ok ? "ok" : "bad"}`} key={`${r.name}-${i}`}>
                {r.ok ? "✓" : "✕"}
                <span>
                  {r.name}
                  {r.ok
                    ? ` · 已切分 ${r.chunks} 个片段（${r.chars} 字）${r.replaced ? " · 已覆盖旧索引" : ""}`
                    : ` · ${r.error}`}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="doc-list">
          <div className="doc-head">
            <span>已入库文档</span>
            <span>{loading ? "加载中…" : `共 ${documents.length} 篇`}</span>
          </div>
          {documents.length === 0 && !loading ? (
            <div className="empty-list">还没有文档，先上传一份资料试试。</div>
          ) : (
            documents.map((doc) => (
              <div className="doc-row" key={doc.id}>
                <div className="doc-icon">{doc.ext}</div>
                <div className="doc-main">
                  <div className="doc-name">{doc.name}</div>
                  <div className="doc-meta">
                    {doc.chunks} 片段 · {doc.chars.toLocaleString("zh-CN")} 字 · {(doc.size / 1024).toFixed(1)} KB ·{" "}
                    {new Date(doc.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => void remove(doc)} title="删除">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="tip">
          批量导入：把文件放进 <code>.data/docs</code> 目录，执行 <code>npm run ingest</code> 即可离线建索引。
          <br />
          向量与元数据存放在 <code>.data/index</code>；更换 embedding 模型后维度会变化，需要清空该目录重新入库。
        </div>
      </div>
    </div>
  );
}
