import { runAgent } from "@/lib/agent/runtime";
import { isLlmConfigured } from "@/lib/config";
import type { AgentEvent, Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface IncomingMessage {
  role: Role;
  content: string;
}

export async function POST(req: Request) {
  if (!isLlmConfigured()) {
    return Response.json(
      { error: "服务端未配置模型密钥，请在 .env.local 中填写 OPENAI_API_KEY 后重启。" },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { messages?: IncomingMessage[]; plugins?: unknown; focusPlugin?: unknown }
    | null;
  const messages = sanitize(body?.messages);
  // null 表示前端没表态，交给插件自身的默认开关
  const plugins = sanitizePlugins(body?.plugins);
  const focusPlugin = typeof body?.focusPlugin === "string" ? body.focusPlugin.slice(0, 64) : null;

  if (messages.length === 0) {
    return Response.json({ error: "messages 不能为空" }, { status: 400 });
  }
  if (messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "最后一条消息必须是用户消息" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const push = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        for await (const event of runAgent({ messages, signal: req.signal, plugins, focusPlugin })) {
          push(event);
        }
      } catch (err) {
        push({ type: "error", message: (err as Error).message ?? "未知错误" });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* 客户端已断开 */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // 关掉 Nginx 缓冲，保证逐字输出
    },
  });
}

function sanitize(input: unknown): IncomingMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m): m is IncomingMessage => {
      return (
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
      );
    })
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
}

/** 只接受字符串数组；非数组一律视为「没表态」 */
function sanitizePlugins(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  return input
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .slice(0, 50)
    .map((id) => id.slice(0, 64));
}
