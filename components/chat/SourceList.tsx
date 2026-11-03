"use client";

import type { Source } from "@/lib/types";

export function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="sources">
      <div className="sources-head">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" strokeLinecap="round" />
          <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" strokeLinecap="round" />
        </svg>
        引用来源 · {sources.length} 条
      </div>
      {sources.map((s, i) => (
        <div className="source-item" key={`${s.id || s.source}-${s.chunk}-${i}`}>
          <div className="source-idx">{i + 1}</div>
          <div className="source-main">
            <div className="source-name">
              <span>{s.source}</span>
              <span className="score">相关度 {s.score.toFixed(2)}</span>
              <span style={{ color: "var(--text-faint)", fontWeight: 400, fontSize: 11.5 }}>第 {s.chunk + 1} 片段</span>
            </div>
            <div className="source-preview">{s.preview}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
