import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { listDocuments } from "../store/registry";
import { retrieve } from "../rag/retriever";
import type { Source } from "../types";

/** 一次会话内共享的状态：工具把检索命中的片段回传给上层，用于前端展示引用 */
export interface AgentState {
  sources: Source[];
}

export const BUILTIN_TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: "检索知识库",
  list_knowledge_base: "查看知识库目录",
};

const searchSchema = z.object({
  query: z
    .string()
    .describe("检索用的自然语言问题或关键词，尽量保留原文中的专有名词、型号、数字。"),
  topK: z.number().int().min(1).max(10).optional().describe("返回片段数量，默认使用系统配置（一般 5 条）。"),
});

const listSchema = z.object({});

/**
 * 工具在每次请求时创建，闭包持有 state，
 * 这样检索命中的片段可以随 SSE 事件推给前端做引用展示。
 */
export function createTools(state: AgentState) {
  const searchKnowledgeBase = tool(
    async ({ query, topK }) => {
      const hits = await retrieve(query, topK ? { topK } : undefined);
      state.sources = hits.map((h) => h.source);

      if (hits.length === 0) {
        return "知识库中没有检索到相关内容。请如实告知用户，并建议换个说法或先上传相关资料。";
      }

      const blocks = hits.map((hit, i) => {
        return `[${i + 1}] 来源：${hit.source.source}（第 ${hit.source.chunk + 1} 块，相关度 ${hit.source.score}）\n${hit.content}`;
      });

      return [
        `共检索到 ${hits.length} 条相关片段，按相关度从高到低排列：`,
        "",
        blocks.join("\n\n---\n\n"),
        "",
        "回答时请在对应句子后用 [1] [2] 这样的角标标注来源编号。",
      ].join("\n");
    },
    {
      name: "search_knowledge_base",
      description:
        "在企业知识库中做语义检索。任何涉及内部文档、产品资料、制度流程、具体数据的问题，都必须先调用它拿到依据再回答。",
      schema: searchSchema,
    }
  );

  const listKnowledgeBase = tool(
    async () => {
      const docs = await listDocuments();
      if (docs.length === 0) return "知识库当前为空，尚未上传任何文档。";
      const lines = docs.map((d, i) => `${i + 1}. ${d.name}（${d.chunks} 个片段，${d.chars} 字）`);
      return `知识库共有 ${docs.length} 篇文档：\n${lines.join("\n")}`;
    },
    {
      name: "list_knowledge_base",
      description: "列出知识库里已收录的全部文档名称与规模。当用户问「知识库里有什么」或需要判断该查哪些资料时使用。",
      schema: listSchema,
    }
  );

  return [searchKnowledgeBase, listKnowledgeBase];
}

export function toolLabel(name: string, extra?: Record<string, string>): string {
  return extra?.[name] ?? BUILTIN_TOOL_LABELS[name] ?? name;
}
