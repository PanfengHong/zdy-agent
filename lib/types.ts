export type Role = "user" | "assistant";

/** 命中片段，用于前端引用展示 */
export interface Source {
  id: string;
  source: string;
  chunk: number;
  score: number;
  preview: string;
}

/** 一次工具调用的轨迹，用于前端展示 Agent 的思考过程 */
export interface ToolTrace {
  id: string;
  name: string;
  label: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error";
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  sources?: Source[];
  tools?: ToolTrace[];
  error?: string;
  /** 用户中途停止生成 */
  stopped?: boolean;
  /** 本次生成耗时（毫秒），用于回答结束后的状态条 */
  durationMs?: number;
  createdAt: number;
}

/** 知识库文档元数据 */
export interface DocMeta {
  id: string;
  name: string;
  ext: string;
  size: number;
  chars: number;
  chunks: number;
  createdAt: number;
  updatedAt: number;
}

/** SSE 事件协议：后端 -> 前端 */
export type AgentEvent =
  | { type: "delta"; text: string }
  | { type: "tool_start"; id: string; name: string; label: string; args?: Record<string, unknown> }
  | { type: "tool_end"; id: string; name: string; summary: string; ok: boolean }
  | { type: "sources"; sources: Source[] }
  | { type: "done" }
  | { type: "error"; message: string };
