import { useEffect, useRef, useMemo, memo } from 'react';
import { Loader2 } from 'lucide-react';
import { TextMessage } from './TextMessage';
import { ToolCallCard } from './ToolCallCard';
import { ToolCallGroup } from './ToolCallGroup';
import { PlanCard } from './PlanCard';
import { PermissionCard } from './PermissionCard';

interface Message {
  id: string;
  msgId: string;
  type: string;
  role: string;
  content: unknown;
  status?: string | null;
  toolCallId?: string | null;
}

interface MessageStreamProps {
  messages: Message[];
  todoId: string;
  status?: string;
  permissionRequest: {
    requestId: number;
    request: {
      options: Array<{ optionId: string; name: string; kind: string }>;
      toolCall: { title: string; kind: string; rawInput?: Record<string, unknown> };
    };
  } | null;
  onPermissionResolved: () => void;
}

// Deduplicate messages by msgId, keeping the last occurrence (most up-to-date).
// tool_calls are keyed by msgId (= toolCallId) and merged so status updates win.
function dedupeMessages(messages: Message[]): Message[] {
  const seen = new Map<string, number>(); // msgId -> index in result
  const result: Message[] = [];

  for (const msg of messages) {
    const existing = seen.get(msg.msgId);
    if (existing !== undefined) {
      if (msg.type === 'tool_call') {
        // Deep-merge tool_call: later fields (status, etc.) override earlier ones
        const prev = result[existing];
        const prevContent = prev.content as Record<string, unknown>;
        const newContent = msg.content as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...prevContent };
        for (const [k, v] of Object.entries(newContent)) {
          if (v !== undefined && v !== null && v !== '') merged[k] = v;
        }
        result[existing] = { ...prev, ...msg, content: merged };
      } else if (msg.type === 'text' || msg.type === 'thought') {
        // text chunks are already accumulated upstream; just keep latest
        result[existing] = msg;
      } else {
        result[existing] = msg;
      }
    } else {
      seen.set(msg.msgId, result.length);
      result.push(msg);
    }
  }

  return result;
}

// Build render items from a flat, deduped message list.
// Consecutive tool_calls are grouped into ToolCallGroup; everything else renders inline.
function buildRenderItems(messages: Message[], lastTextMsgId: string | null): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  let toolBuffer: Message[] = [];
  let userQIndex = 0;

  function flushToolBuffer() {
    if (toolBuffer.length === 0) return;
    const buf = toolBuffer;
    toolBuffer = [];
    if (buf.length === 1) {
      items.push(
        <div key={buf[0].id} className="my-1">
          <ToolCallCard content={buf[0].content as any} status={buf[0].status ?? undefined} />
        </div>,
      );
    } else {
      items.push(<ToolCallGroup key={buf[0].id} tools={buf} />);
    }
  }

  for (const msg of messages) {
    if (msg.type === 'tool_call') {
      toolBuffer.push(msg);
      continue;
    }

    flushToolBuffer();

    if (msg.type === 'thought') {
      // thoughts are not displayed
      continue;
    }

    if (msg.type === 'text' && msg.role === 'user') {
      const content = msg.content as { text: string };
      userQIndex++;
      items.push(
        <div key={msg.id} id={`qa-user-${userQIndex}`} className="flex justify-end my-4">
          <div className="bg-[#f0f0ef] rounded-2xl px-4 py-2.5 max-w-[80%]">
            <p className="text-sm text-notion-text leading-relaxed m-0">{content.text}</p>
          </div>
        </div>,
      );
      continue;
    }

    if (msg.type === 'text' && msg.role === 'assistant') {
      const content = msg.content as { text: string };
      items.push(
        <div key={msg.id} className="my-4">
          <TextMessage content={content} streaming={msg.msgId === lastTextMsgId} />
        </div>,
      );
      continue;
    }

    if (msg.type === 'plan') {
      items.push(
        <div key={msg.id} className="my-2">
          <PlanCard content={msg.content as any} />
        </div>,
      );
      continue;
    }

    if (msg.type === 'system') {
      const content = msg.content as { text: string };
      items.push(
        <p key={msg.id} className="text-xs text-center text-notion-text-tertiary py-1 my-1">
          {content.text}
        </p>,
      );
      continue;
    }

    if (msg.type === 'error') {
      const content = msg.content as { text: string };
      items.push(
        <div
          key={msg.id}
          className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 my-2"
        >
          {content.text}
        </div>,
      );
      continue;
    }
  }

  flushToolBuffer();
  return items;
}

const MessageStreamBody = memo(function MessageStreamBody({
  messages,
  lastTextMsgId,
}: {
  messages: Message[];
  lastTextMsgId: string | null;
}) {
  const items = useMemo(() => buildRenderItems(messages, lastTextMsgId), [messages, lastTextMsgId]);
  return <>{items}</>;
});

export function MessageStream({
  messages,
  todoId,
  status,
  permissionRequest,
  onPermissionResolved,
}: MessageStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const isStreaming = status === 'running' || status === 'initializing';
  const userScrolledUpRef = useRef(false);

  const lastTextMsgId = isStreaming
    ? ([...messages].reverse().find((m) => m.type === 'text' && m.role === 'assistant')?.msgId ??
      null)
    : null;

  // Detect scroll container (the overflow-y-auto parent) on mount
  useEffect(() => {
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    scrollContainerRef.current = el;

    const onScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > 100;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!bottomRef.current) return;
    if (userScrolledUpRef.current) return;
    if (isStreaming) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' });
    } else {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isStreaming]);

  const deduped = useMemo(() => dedupeMessages(messages), [messages]);
  const showSpinner = isStreaming && !permissionRequest;

  if (messages.length === 0 && !permissionRequest && !showSpinner) {
    const isEmpty = status === 'idle' || !status;
    const isFailed = status === 'failed' || status === 'cancelled';
    return (
      <div className="flex items-center justify-center py-16 text-sm">
        {isFailed ? (
          <span className="text-notion-red">Run failed — no output recorded.</span>
        ) : isEmpty ? (
          <span className="text-notion-text-tertiary">No output yet. Press Run to start.</span>
        ) : (
          <span className="text-notion-text-secondary">Waiting for agent output...</span>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      <MessageStreamBody messages={deduped} lastTextMsgId={lastTextMsgId} />

      {showSpinner && (
        <div className="my-3">
          <Loader2 size={14} className="animate-spin text-notion-text-tertiary" />
        </div>
      )}

      {permissionRequest && (
        <PermissionCard
          todoId={todoId}
          requestId={permissionRequest.requestId}
          request={permissionRequest.request}
          onResolved={onPermissionResolved}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
