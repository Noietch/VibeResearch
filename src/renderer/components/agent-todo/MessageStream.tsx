import { useEffect, useRef, useMemo } from 'react';
import { TextMessage } from './TextMessage';
import { ThoughtBlock } from './ThoughtBlock';
import { ToolCallCard } from './ToolCallCard';
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

interface MessageGroup {
  role: 'user' | 'assistant' | 'system';
  messages: Message[];
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    // system/error messages are their own group
    if (msg.type === 'system' || msg.type === 'error') {
      groups.push({ role: 'system', messages: [msg] });
      continue;
    }

    const role = msg.role === 'user' ? 'user' : 'assistant';
    const last = groups[groups.length - 1];

    if (last && last.role === role) {
      last.messages.push(msg);
    } else {
      groups.push({ role, messages: [msg] });
    }
  }

  return groups;
}

function MessageGroupView({
  group,
  lastTextMsgId,
}: {
  group: MessageGroup;
  lastTextMsgId: string | null;
}) {
  if (group.role === 'system') {
    const msg = group.messages[0];
    const content = msg.content as { text: string };
    if (msg.type === 'error') {
      return (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 my-2">
          {content.text}
        </div>
      );
    }
    return (
      <p className="text-xs text-center text-notion-text-tertiary py-1 my-1">{content.text}</p>
    );
  }

  if (group.role === 'user') {
    return (
      <div className="flex flex-col items-end ml-8 my-2">
        <span className="text-xs text-notion-text-tertiary mb-1 mr-1">You</span>
        <div className="bg-notion-accent-light border border-notion-accent/20 rounded-xl rounded-tr-sm px-4 py-2.5 max-w-full">
          {group.messages.map((msg) => {
            const content = msg.content as { text: string };
            return (
              <div key={msg.id} className="prose prose-sm max-w-none text-notion-text">
                <p className="m-0 text-sm">{content.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // assistant group - merge consecutive thought messages
  const mergedElements: React.ReactNode[] = [];
  let consecutiveThoughts: { id: string; text: string }[] = [];

  function flushThoughts() {
    if (consecutiveThoughts.length > 0) {
      const mergedText = consecutiveThoughts.map((t) => t.text).join('\n\n');
      const key = consecutiveThoughts[0].id;
      consecutiveThoughts = [];
      return <ThoughtBlock key={key} content={{ text: mergedText }} />;
    }
    return null;
  }

  for (const msg of group.messages) {
    const content = msg.content as Record<string, unknown>;

    if (msg.type === 'thought') {
      consecutiveThoughts.push({ id: msg.id, text: (content as { text: string }).text });
    } else {
      // Flush accumulated thoughts before rendering other message types
      const thoughtsEl = flushThoughts();
      if (thoughtsEl) mergedElements.push(thoughtsEl);

      switch (msg.type) {
        case 'text':
          mergedElements.push(
            <TextMessage
              key={msg.id}
              content={content as { text: string }}
              streaming={msg.msgId === lastTextMsgId}
            />,
          );
          break;
        case 'tool_call':
          mergedElements.push(
            <ToolCallCard
              key={msg.msgId}
              content={content as any}
              status={msg.status ?? undefined}
            />,
          );
          break;
        case 'plan':
          mergedElements.push(<PlanCard key={msg.id} content={content as any} />);
          break;
      }
    }
  }
  // Flush any remaining thoughts at the end
  const remainingThoughts = flushThoughts();
  if (remainingThoughts) mergedElements.push(remainingThoughts);

  return (
    <div className="flex flex-col items-start mr-8 my-2">
      <span className="text-xs text-notion-text-tertiary mb-1 ml-1">Agent</span>
      <div className="bg-notion-sidebar border border-notion-border rounded-xl rounded-tl-sm px-4 py-2.5 w-full">
        {mergedElements}
      </div>
    </div>
  );
}

export function MessageStream({
  messages,
  todoId,
  status,
  permissionRequest,
  onPermissionResolved,
}: MessageStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = status === 'running' || status === 'initializing';

  // The last text message from the assistant is the one currently streaming
  const lastTextMsgId = isStreaming
    ? ([...messages].reverse().find((m) => m.type === 'text' && m.role === 'assistant')?.msgId ??
      null)
    : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Show thinking dots when running but no text output yet
  const hasTextOutput = useMemo(
    () => messages.some((m) => m.type === 'text' && m.role === 'assistant'),
    [messages],
  );
  const showThinking = isStreaming && !hasTextOutput && !permissionRequest;

  if (messages.length === 0 && !permissionRequest && !showThinking) {
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

  const groups = groupMessages(messages);

  return (
    <div className="p-4 space-y-0.5">
      {groups.map((group, i) => (
        <MessageGroupView key={i} group={group} lastTextMsgId={lastTextMsgId} />
      ))}

      {showThinking && (
        <div className="flex items-start mr-8 my-2">
          <div className="bg-notion-sidebar border border-notion-border rounded-xl rounded-tl-sm px-4 py-3">
            <div className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full bg-notion-text-tertiary animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-notion-text-tertiary animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-notion-text-tertiary animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
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
