"use client";

import type { ToolTrace } from "@/lib/types";

function queryOf(trace: ToolTrace): string | null {
  const q = trace.args?.query;
  return typeof q === "string" ? q : null;
}

export function ToolTraces({ traces }: { traces: ToolTrace[] }) {
  if (traces.length === 0) return null;
  return (
    <div className="traces">
      {traces.map((trace) => {
        const q = queryOf(trace);
        const cls = trace.status === "running" ? "trace running" : trace.status === "error" ? "trace error" : "trace";
        return (
          <div className={cls} key={trace.id}>
            {trace.status === "running" ? (
              <span className="spinner" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="m4 12.5 5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span>{trace.label}</span>
            {q ? <span className="trace-q">「{q}」</span> : null}
            {trace.summary ? <span style={{ color: "var(--text-faint)" }}>· {trace.summary}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
