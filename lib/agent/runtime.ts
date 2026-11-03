import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type AIMessageChunk,
  type BaseMessage,
} from "@langchain/core/messages";
import { getChatModel } from "../llm";
import type { AgentEvent, Role, Source } from "../types";
import { BUILTIN_TOOL_LABELS, createTools, toolLabel, type AgentState } from "./tools";
import { dedupeTools, getPluginContributions, type RuntimeTool } from "../plugins/registry";

const BASE_PROMPT = `你是「企业知识库助手」，帮助用户基于内部资料准确、简洁地回答问题。

工作方式：
1. 只要问题涉及具体事实、数据、流程、产品、制度、人员，先调用 search_knowledge_base 检索；拿不准知识库有没有，也先检索一次。
2. 只依据检索结果回答。若结果不足以支撑结论，明确说明"知识库中没有找到相关内容"，并说明还缺哪方面的资料；绝不编造，也不要用训练语料里的旧信息冒充内部资料。
3. 引用检索内容时，在对应句子末尾标注角标 [1] [2]，编号必须与检索片段的顺序一致；同一处多来源写作 [1][3]。
4. 纯粹的问候、闲聊，或者与内部资料无关的通用知识，可以不检索直接回答，但要说明这是通用经验而非公司资料。
5. 用户问"知识库里有什么"时，调用 list_knowledge_base。
6. 用简体中文。先给结论再展开；条理多时用 Markdown 列表或表格。不要写"根据检索结果""综上所述"这类空话，直接给内容。
7. 不要提及工具名称或技术实现，把检索过程说成"查阅资料"。`;

const MAX_STEPS = 5;

/** 工具集合的宽松类型：不同工具的入参 schema 不同，运行期只需 name + invoke */
type AnyTool = RuntimeTool;

export interface RunOptions {
  messages: { role: Role; content: string }[];
  signal?: AbortSignal;
  maxSteps?: number;
  /** 启用的插件 id 列表；null / 省略表示使用插件自身的默认开关 */
  plugins?: string[] | null;
  /** 用户这次在输入框里显式点选的插件，提示模型优先使用 */
  focusPlugin?: string | null;
}

/** 把已启用插件的能力拼进系统提示词，让模型知道有哪些扩展工具可用 */
function buildSystemPrompt(extra?: { tools: { label: string; description: string }[]; instructions: string; focus?: string | null }) {
  const sections = [BASE_PROMPT];
  if (!extra) return BASE_PROMPT;

  if (extra.tools.length > 0) {
    const lines = extra.tools.map((t) => `- ${t.label}：${t.description}`);
    sections.push(`可用的扩展工具（来自已启用的插件，按需调用）：\n${lines.join("\n")}`);
  }
  if (extra.instructions) {
    sections.push(`插件附加约定：\n${extra.instructions}`);
  }
  if (extra.focus) {
    sections.push(`用户这次显式选择了「${extra.focus}」插件，请优先使用它提供的工具；若确实不适用于当前问题，再用其他方式回答并说明原因。`);
  }
  return sections.join("\n\n");
}

/** 一次 Agent 运行：模型推理 -> 工具调用 -> 回到模型 -> 输出，全程以事件流吐出 */
export async function* runAgent({
  messages,
  signal,
  maxSteps = MAX_STEPS,
  plugins = null,
  focusPlugin = null,
}: RunOptions): AsyncGenerator<AgentEvent> {
  const state: AgentState = { sources: [] };
  const contributions = await getPluginContributions(plugins);

  // 内置工具优先，插件工具重名时让位，避免覆盖核心检索能力
  const builtinTools = createTools(state);
  const builtinNames = new Set<string>(builtinTools.map((t) => t.name as string));
  const pluginTools = dedupeTools(contributions.tools).filter((t) => !builtinNames.has(t.name));

  const tools = [...builtinTools, ...pluginTools];
  const toolMap = new Map<string, AnyTool>(tools.map((t) => [t.name, t as unknown as AnyTool] as [string, AnyTool]));
  const labels: Record<string, string> = { ...BUILTIN_TOOL_LABELS, ...contributions.labels };

  const systemPrompt = buildSystemPrompt({
    tools: pluginTools.map((t) => ({ label: labels[t.name] ?? t.name, description: t.description })),
    instructions: contributions.instructions,
    focus: focusPlugin ? (contributions.names[focusPlugin] ?? focusPlugin) : null,
  });

  // bindTools 只认真正的 LangChain 工具实例，插件工具要用原始对象，不能只传 { name, invoke }
  const bindable = [...builtinTools, ...pluginTools.map((t) => t.raw)] as never[];
  const model = getChatModel().bindTools(bindable);
  const history: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...messages.map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content))),
  ];

  try {
    for (let step = 0; step < maxSteps; step++) {
      const stream = await model.stream(history, { signal });

      let acc: AIMessageChunk | null = null;
      for await (const chunk of stream) {
        acc = acc ? acc.concat(chunk) : chunk;
        const text = contentToText(chunk.content);
        if (text) yield { type: "delta", text };
      }
      if (!acc) break;

      const toolCalls = acc.tool_calls ?? [];
      // tool_calls 已通过结构化字段传递，避免在 additional_kwargs 里重复下发
      const { tool_calls: _ignored, ...kwargs } = (acc.additional_kwargs ?? {}) as Record<string, unknown>;
      history.push(
        new AIMessage({
          content: acc.content,
          tool_calls: toolCalls,
          additional_kwargs: kwargs,
        })
      );

      if (toolCalls.length === 0) break;

      for (const call of toolCalls) {
        const callId = call.id ?? `call_${step}_${call.name}`;
        yield {
          type: "tool_start",
          id: callId,
          name: call.name,
          label: toolLabel(call.name, labels),
          args: (call.args ?? {}) as Record<string, unknown>,
        };

        const target = toolMap.get(call.name);
        let output: string;
        let ok = true;

        if (!target) {
          ok = false;
          output = `未知工具：${call.name}`;
        } else {
          try {
            output = String(await target.invoke(call.args as never));
          } catch (err) {
            ok = false;
            output = `工具执行失败：${(err as Error).message}`;
          }
        }

        yield { type: "tool_end", id: callId, name: call.name, summary: summarize(output), ok };
        history.push(new ToolMessage({ content: output, tool_call_id: callId, name: call.name }));
      }
    }

    if (state.sources.length > 0) {
      yield { type: "sources", sources: dedupe(state.sources) };
    }
    yield { type: "done" };
  } catch (err) {
    if (signal?.aborted) return; // 用户主动停止，不算错误
    yield { type: "error", message: normalizeError(err) };
  }
}

/** 部分模型/网关返回的是内容块数组，这里统一取文本 */
function contentToText(content: AIMessageChunk["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (typeof b.text === "string") return b.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function dedupe(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    const key = s.id || `${s.source}#${s.chunk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function summarize(output: string, max = 64): string {
  const hit = output.match(/共检索到\s*(\d+)\s*条/);
  if (hit) return `命中 ${hit[1]} 条相关片段`;
  if (output.includes("没有检索到相关内容") || output.includes("没有检索到相关")) return "未命中相关内容";
  const docs = output.match(/共有\s*(\d+)\s*篇文档/);
  if (docs) return `共 ${docs[1]} 篇文档`;
  if (output.startsWith("工具执行失败")) return output.slice(0, max);
  const flat = output.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function normalizeError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err);
  if (/401|invalid_api_key|Unauthorized|authentication/i.test(msg)) {
    return "模型鉴权失败（401）：请检查 .env.local 中的 OPENAI_API_KEY / OPENAI_BASE_URL 是否正确。";
  }
  if (/404|model_not_found|not found/i.test(msg)) {
    return `模型或接口地址不存在（404）：请确认 CHAT_MODEL 与 OPENAI_BASE_URL 是否匹配。原始信息：${msg}`;
  }
  if (/429|rate limit/i.test(msg)) {
    return "触发模型限流（429），请稍后重试或降低并发。";
  }
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|timeout/i.test(msg)) {
    return `无法连接模型服务：请检查网络或代理。原始信息：${msg}`;
  }
  return msg;
}
