import { useState, useEffect, useCallback } from 'react';
import { Bot } from 'lucide-react';
import { ipc, onIpc } from '../../hooks/use-ipc';
import type { AgentTodoItem, AgentTodoQuery } from '@shared';
import { TodoCard } from '../../components/agent-todo/TodoCard';

type StatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'idle';

export function AgentTodosPage() {
  const [todos, setTodos] = useState<AgentTodoItem[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const loadTodos = useCallback(async () => {
    try {
      const query: AgentTodoQuery | undefined = filter !== 'all' ? { status: filter } : undefined;
      const data = await ipc.listAgentTodos(query);
      setTodos(data);
    } catch (err) {
      console.error(err);
    }
  }, [filter]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  // Listen for status changes to refresh list
  useEffect(() => {
    const off = onIpc('agent-todo:status', () => {
      loadTodos();
    });
    return off;
  }, [loadTodos]);

  const filters: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'running', label: 'Running' },
    { id: 'completed', label: 'Completed' },
    { id: 'failed', label: 'Failed' },
    { id: 'idle', label: 'Idle' },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center">
        <div className="flex items-center gap-3">
          <Bot size={22} className="text-notion-text-tertiary" />
          <h1 className="text-2xl font-bold tracking-tight text-notion-text">Agent Tasks</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              filter === f.id
                ? 'bg-notion-sidebar-hover text-notion-text font-medium'
                : 'text-notion-text-secondary hover:bg-notion-sidebar hover:text-notion-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Todo List */}
      <div className="space-y-3">
        {todos.length === 0 ? (
          <div className="py-16 text-center text-notion-text-secondary">
            <Bot size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No agent tasks yet.</p>
            <p className="text-xs mt-1">Create tasks from a Project's Todos tab.</p>
          </div>
        ) : (
          todos.map((todo) => (
            <TodoCard key={todo.id} todo={todo} onRefresh={loadTodos} />
          ))
        )}
      </div>
    </div>
  );
}
