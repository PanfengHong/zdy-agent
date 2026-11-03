"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/lib/types";
import { MessageActions } from "./MessageActions";
import { SourceList } from "./SourceList";
import { ToolTraces } from "./ToolTraces";

interface Props {
  message: ChatMessage;
  streaming?: boolean;
  onRegenerate?: (id: string) => void;
  regenerateDisabled?: boolean;
}

export function MessageItem({ message, streaming = false, onRegenerate, regenerateDisabled }: Props) {
  if (message.role === "user") {
    return (
      <div className="msg msg-user">
        <div className="bubble-user">{message.content}</div>
      </div>
    );
  }

  const showThinking = streaming && !message.content && (message.tools?.length ?? 0) === 0;

  return (
    <div className="msg">
      <div className="avatar">AI</div>
      <div className="msg-body">
        <ToolTraces traces={message.tools ?? []} />

        {showThinking ? (
          <div className="trace running">
            <span className="spinner" />
            正在思考…
          </div>
        ) : null}

        {message.content ? (
          <div className={`markdown${streaming ? " streaming" : ""}`}>
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
        ) : null}

        {message.error ? <div className="error-box">{message.error}</div> : null}

        {!streaming && message.sources?.length ? <SourceList sources={message.sources} /> : null}

        {/* 回答写完才出现：既是结束标识，也承载复制 / 重新生成 */}
        {!streaming && (message.content || message.error) ? (
          <MessageActions
            content={message.content}
            sources={message.sources}
            stopped={message.stopped}
            failed={Boolean(message.error)}
            durationMs={message.durationMs}
            onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
            regenerateDisabled={regenerateDisabled}
          />
        ) : null}
      </div>
    </div>
  );
}
