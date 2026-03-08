import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Play, Square, Calendar, Clock, Zap, ChevronDown, ChevronRight, ArrowUp, X, Hash } from 'lucide-react';
import { ipc } from '../../../hooks/use-ipc';
import { useAgentStream } from '../../../hooks/use-agent-stream';
import { MessageStream } from '../../../components/agent-todo/MessageStream';
import { RunTimeline } from '../../../components/agent-todo/RunTimeline';
import { StatusDot } from '../../../components/agent-todo/StatusDot';
import { PriorityBarIcon } from '../../../components/agent-todo/PriorityBar';

const LEVEL_LABELS = ['Low', 'Normal', 'Medium', 'High', 'Urgent'];

function TaskInfoPanel({ todo, onYoloToggle }: { todo: any; onYoloToggle: (val: boolean) => void }) {
  const [promptExpanded, setPromptExpanded] = useState(false);

  return (
    <div className="px-3 py-3 space-y-3 border-t border-notion-border">
      <span className="text-xs font-medium text-notion-text-secondary uppercase tracking-wide block">
        Task Info
      </span>

      {/* Prompt */}
      <div>
        <button
          onClick={() => setPromptExpanded(!promptExpanded)}
          className="flex items-center gap-1 text-xs text-notion-text-secondary hover:text-notion-text transition-colors w-full text-left"
        >
          {promptExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="font-medium">Prompt</span>
        </button>
        {promptExpanded && (
          <p className="mt-1.5 text-xs text-notion-text-secondary leading-relaxed whitespace-pre-wrap pl-4">
            {todo.prompt}
          </p>
        )}
        {!promptExpanded && (
          <p className="mt-1 text-xs text-notion-text-tertiary truncate pl-4">
            {todo.prompt}
          </p>
        )}
      </div>

      {/* Priority */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-notion-text-secondary w-14 flex-shrink-0">Priority</span>
        <div className="flex items-center gap-1.5">
          <PriorityBarIcon value={todo.priority ?? 0} />
          <span className="text-xs text-notion-text-secondary">
            {LEVEL_LABELS[todo.priority ?? 0]}
          </span>
        </div>
      </div>

      {/* YOLO mode toggle pill */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={12} className={todo.yoloMode ? 'text-amber-500' : 'text-notion-text-tertiary'} />
          <span className={`text-xs font-medium ${todo.yoloMode ? 'text-amber-600' : 'text-notion-text-secondary'}`}>
            YOLO
          </span>
        </div>
        <button
          onClick={() => onYoloToggle(!todo.yoloMode)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
            todo.yoloMode ? 'bg-amber-400' : 'bg-notion-border'
          }`}
          title={todo.yoloMode ? 'Auto mode on — click to disable' : 'Auto mode off — click to enable'}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
              todo.yoloMode ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Cron */}
      {todo.cronEnabled && todo.cronExpr && (
        <div className="flex items-start gap-2">
          <Calendar size={12} className="text-notion-text-secondary flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-xs text-notion-text-secondary font-medium">Scheduled</span>
            <p className="text-xs font-mono text-notion-text-tertiary mt-0.5">{todo.cronExpr}</p>
          </div>
        </div>
      )}

      {/* Created at */}
      <div className="flex items-center gap-2">
        <Clock size={12} className="text-notion-text-tertiary flex-shrink-0" />
        <span className="text-xs text-notion-text-tertiary">
          {new Date(todo.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
    </div>
  );
}

export function AgentTodoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [todo, setTodo] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [historicMessages, setHistoricMessages] = useState<any[]>([]);

  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [showStderr, setShowStderr] = useState(true);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);

  const {
    messages: streamMessages,
    status: streamStatus,
    permissionRequest,
    setPermissionRequest,
    canChat,
    stderrLines,
    availableCommands,
  } = useAgentStream(id!);

  const filteredCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    return availableCommands.filter((c) =>
      c.name.toLowerCase().includes(slashFilter.toLowerCase()),
    );
  }, [slashMenuOpen, slashFilter, availableCommands]);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [todoData, runsData] = await Promise.all([
        ipc.getAgentTodo(id!),
        ipc.listAgentTodoRuns(id!),
      ]);
      setTodo(todoData);
      setRuns(runsData);
      // Auto-select latest run
      if (runsData.length > 0 && !selectedRunId) {
        setSelectedRunId(runsData[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (!selectedRunId) return;
    // If it's the current running run, use stream messages
    const currentRun = runs[0];
    if (
      currentRun &&
      selectedRunId === currentRun.id &&
      (currentRun.status === 'running' || streamMessages.length > 0)
    ) {
      setHistoricMessages([]);
      return;
    }
    // Otherwise load from DB
    ipc
      .getAgentTodoRunMessages(selectedRunId)
      .then((msgs) => {
        const parsed = msgs.map((m) => ({
          ...m,
          content: typeof m.content === 'string' ? JSON.parse(m.content) : m.content,
        }));
        // Merge chunks with the same msgId: concatenate text, keep last for tool_call
        const merged: typeof parsed = [];
        const seen = new Map<string, number>(); // msgId -> index in merged
        for (const m of parsed) {
          const existing = seen.get(m.msgId);
          if (existing !== undefined && m.type === 'text') {
            const prev = merged[existing];
            const prevText = (prev.content as { text: string }).text;
            const newText = (m.content as { text: string }).text;
            merged[existing] = { ...prev, content: { text: prevText + newText } };
          } else if (existing !== undefined && m.type === 'tool_call') {
            // Merge tool_call updates: keep non-empty fields, update status
            const prev = merged[existing];
            const prevContent = prev.content as Record<string, unknown>;
            const newContent = m.content as Record<string, unknown>;
            const mergedContent: Record<string, unknown> = { ...prevContent };
            for (const [k, v] of Object.entries(newContent)) {
              if (v !== undefined && v !== null && v !== '') mergedContent[k] = v;
            }
            merged[existing] = {
              ...prev,
              status: m.status || prev.status,
              content: mergedContent,
            };
          } else if (existing !== undefined && m.type === 'plan') {
            // Plan updates: replace with latest (has most up-to-date entry statuses)
            merged[existing] = m;
          } else {
            seen.set(m.msgId, merged.length);
            merged.push(m);
          }
        }
        setHistoricMessages(merged);
      })
      .catch(console.error);
  }, [selectedRunId, runs]);

  const displayMessages =
    selectedRunId === runs[0]?.id && streamMessages.length > 0 ? streamMessages : historicMessages;

  const latestRunStatus = runs[0]?.status ?? 'idle';
  const currentStatus =
    selectedRunId === runs[0]?.id
      ? streamStatus === 'idle'
        ? latestRunStatus
        : streamStatus
      : (runs.find((r) => r.id === selectedRunId)?.status ?? 'idle');

  // canChat: 选中的 run 是 completed 状态，且是最新 run（有活跃 session）
  const effectiveCanChat =
    currentStatus === 'completed' && selectedRunId === runs[0]?.id
      ? true
      : canChat;

  async function handleRun() {
    setShowStderr(true);
    try {
      await ipc.runAgentTodo(id!);
      const [todoData, runsData] = await Promise.all([
        ipc.getAgentTodo(id!),
        ipc.listAgentTodoRuns(id!),
      ]);
      setTodo(todoData);
      setRuns(runsData);
      // Always switch to the newly created run
      if (runsData.length > 0) {
        setSelectedRunId(runsData[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleStop() {
    try {
      await ipc.stopAgentTodo(id!);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSendMessage() {
    const text = chatInput.trim();
    if (!text || isRunning || !selectedRunId || !effectiveCanChat) return;
    setChatInput('');
    if (chatInputRef.current) chatInputRef.current.style.height = 'auto';
    try {
      await ipc.sendAgentMessage(id!, selectedRunId!, text);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleYoloToggle(val: boolean) {
    try {
      await ipc.updateAgentTodo(id!, { yoloMode: val });
      setTodo((prev: any) => ({ ...prev, yoloMode: val }));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteRun(runId: string) {
    try {
      await ipc.deleteAgentTodoRun(runId);
      // Reload runs and update selection
      const runsData = await ipc.listAgentTodoRuns(id!);
      setRuns(runsData);
      // If deleted run was selected, clear messages and select next available run
      if (selectedRunId === runId) {
        setHistoricMessages([]);
        if (runsData.length > 0) {
          setSelectedRunId(runsData[0].id);
        } else {
          setSelectedRunId(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (!todo) {
    return (
      <div className="flex h-full items-center justify-center text-notion-text-secondary text-sm">
        Loading...
      </div>
    );
  }

  const isRunning = currentStatus === 'running' || currentStatus === 'initializing';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-notion-border px-4 py-3 flex-shrink-0">
        <button
          onClick={() => {
            const from = (location.state as { from?: string })?.from;
            navigate(from ?? '/agent-todos');
          }}
          className="text-notion-text-secondary hover:text-notion-text transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-notion-text truncate">{todo.title}</h1>
          <p className="text-xs text-notion-text-secondary">
            {todo.agent.name} · <span className="font-mono">{todo.cwd}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusDot status={currentStatus} />
          <span className="text-sm text-notion-text-secondary capitalize">{currentStatus}</span>
          {isRunning ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
            >
              <Square size={12} /> Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="flex items-center gap-1 rounded-lg bg-notion-text px-3 py-1.5 text-xs text-white hover:bg-notion-text/90 transition-colors"
            >
              <Play size={12} /> Run
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column: Run Timeline + Task Info */}
        <div className="w-52 flex-shrink-0 border-r border-notion-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <RunTimeline
              runs={runs}
              selectedRunId={selectedRunId}
              onSelect={setSelectedRunId}
              onDelete={handleDeleteRun}
            />
          </div>
          <div className="overflow-y-auto flex-shrink-0 max-h-64">
            <TaskInfoPanel todo={todo} onYoloToggle={handleYoloToggle} />
          </div>
        </div>

        {/* Right column: Message Stream + Chat Input */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* stderr output panel — shown while running */}
          {isRunning && stderrLines.length > 0 && showStderr && (
            <div className="absolute bottom-16 right-4 w-80 rounded-lg bg-gray-900 border border-gray-700 shadow-lg overflow-hidden z-10">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700">
                <span className="text-xs text-gray-400 font-mono">Agent output</span>
                <button
                  onClick={() => setShowStderr(false)}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="px-3 py-2 max-h-32 overflow-y-auto">
                {stderrLines.slice(-20).map((line, i) => (
                  <p key={i} className="text-xs font-mono text-green-400 leading-relaxed">{line}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <MessageStream
              messages={displayMessages}
              todoId={id!}
              status={currentStatus}
              permissionRequest={permissionRequest}
              onPermissionResolved={() => {
                setPermissionRequest(null);
                loadData();
              }}
            />
          </div>

          {/* Chat Input — shown when a run is selected */}
          {selectedRunId && (
            <div className="flex-shrink-0 border-t border-notion-border px-4 py-3 bg-white">
              <div className="rounded-2xl border border-notion-border bg-white shadow-sm transition-all focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                <div className="px-4 pt-3 pb-2 relative">
                  {/* Slash command menu */}
                  {slashMenuOpen && filteredCommands.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 mx-0 rounded-lg border border-notion-border bg-white shadow-lg overflow-hidden z-20 max-h-52 overflow-y-auto">
                      {filteredCommands.map((cmd, i) => (
                        <button
                          key={cmd.name}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const hint = cmd.input?.hint ? ` ${cmd.input.hint}` : '';
                            setChatInput(`/${cmd.name}${hint}`);
                            setSlashMenuOpen(false);
                            chatInputRef.current?.focus();
                          }}
                          className={`w-full flex items-start gap-2 px-3 py-2 text-left transition-colors ${
                            i === slashMenuIndex
                              ? 'bg-notion-accent-light'
                              : 'hover:bg-notion-sidebar'
                          }`}
                        >
                          <Hash size={12} className="text-notion-accent mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-notion-text">{cmd.name}</span>
                            {cmd.input?.hint && (
                              <span className="ml-1.5 text-xs text-notion-text-tertiary font-mono">{cmd.input.hint}</span>
                            )}
                            <p className="text-xs text-notion-text-secondary truncate">{cmd.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setChatInput(val);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      // Open slash menu when input starts with /
                      const slashMatch = val.match(/^\/(\S*)$/);
                      if (slashMatch && availableCommands.length > 0) {
                        setSlashFilter(slashMatch[1]);
                        setSlashMenuOpen(true);
                        setSlashMenuIndex(0);
                      } else {
                        setSlashMenuOpen(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (slashMenuOpen && filteredCommands.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSlashMenuIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSlashMenuIndex((i) => Math.max(i - 1, 0));
                          return;
                        }
                        if (e.key === 'Tab' || (e.key === 'Enter' && !e.nativeEvent.isComposing)) {
                          e.preventDefault();
                          const cmd = filteredCommands[slashMenuIndex];
                          if (cmd) {
                            const hint = cmd.input?.hint ? ` ${cmd.input.hint}` : '';
                            setChatInput(`/${cmd.name}${hint}`);
                          }
                          setSlashMenuOpen(false);
                          return;
                        }
                        if (e.key === 'Escape') {
                          setSlashMenuOpen(false);
                          return;
                        }
                      }
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    onBlur={() => setSlashMenuOpen(false)}
                    placeholder={
                      isRunning
                        ? 'Agent is running...'
                        : effectiveCanChat
                          ? 'Continue the conversation... (type / for commands)'
                          : 'Run the agent to start a conversation...'
                    }
                    disabled={isRunning || !effectiveCanChat}
                    rows={1}
                    className="w-full resize-none bg-transparent text-sm text-notion-text placeholder:text-notion-text-tertiary focus:outline-none disabled:opacity-40"
                    style={{ minHeight: '22px', maxHeight: '120px' }}
                  />
                </div>
                <div className="flex items-center justify-end px-3 pb-2.5">
                  {isRunning ? (
                    <button
                      onClick={handleStop}
                      className="flex-shrink-0 rounded-full bg-gray-400 p-2 text-white hover:bg-gray-500 transition-colors"
                      title="Stop"
                    >
                      <Square size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || !effectiveCanChat}
                      className="flex-shrink-0 rounded-full bg-notion-text p-2 text-white transition-opacity hover:opacity-80 disabled:opacity-30"
                      title="Send"
                    >
                      <ArrowUp size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
