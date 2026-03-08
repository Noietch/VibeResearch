import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileText,
  Edit,
  Terminal,
  Plug,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  X,
} from 'lucide-react';

interface ToolCallContent {
  title?: string;
  kind?: string;
  rawInput?: Record<string, unknown>;
  locations?: Array<{ path: string }>;
  status?: string;
}

interface ToolCallCardProps {
  content: ToolCallContent;
  status?: string;
}

function ToolIcon({ kind }: { kind?: string }) {
  switch (kind) {
    case 'read':
      return <FileText size={13} />;
    case 'edit':
      return <Edit size={13} />;
    case 'execute':
      return <Terminal size={13} />;
    case 'mcp':
      return <Plug size={13} />;
    default:
      return <Terminal size={13} />;
  }
}

function getStatusStyles(status?: string, kind?: string) {
  // For execute commands, use purple theme
  const isExecute = kind === 'execute';

  switch (status) {
    case 'in_progress':
      return isExecute
        ? {
            border: 'border-l-2 border-l-purple-400',
            bg: 'bg-purple-50',
            icon: <Loader2 size={12} className="animate-spin text-purple-500" />,
          }
        : {
            border: 'border-l-2 border-l-blue-400',
            bg: 'bg-blue-50',
            icon: <Loader2 size={12} className="animate-spin text-blue-500" />,
          };
    case 'completed':
      return isExecute
        ? {
            border: 'border-l-2 border-l-purple-400',
            bg: 'bg-purple-50',
            icon: <Check size={12} className="text-purple-500" />,
          }
        : {
            border: 'border-l-2 border-l-green-400',
            bg: 'bg-green-50',
            icon: <Check size={12} className="text-green-500" />,
          };
    case 'failed':
      return {
        border: 'border-l-2 border-l-red-400',
        bg: 'bg-red-50',
        icon: <X size={12} className="text-red-500" />,
      };
    default:
      // pending or unknown
      return isExecute
        ? {
            border: 'border-l-2 border-l-purple-300',
            bg: 'bg-purple-50/50',
            icon: <Loader2 size={12} className="animate-spin text-purple-400" />,
          }
        : {
            border: 'border-l-2 border-l-amber-400',
            bg: 'bg-amber-50',
            icon: <Loader2 size={12} className="animate-spin text-amber-500" />,
          };
  }
}

export function ToolCallCard({ content, status }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const path = content.locations?.[0]?.path ?? (content.rawInput?.path as string) ?? null;
  const command = (content.rawInput?.command as string) ?? null;
  // Always show expand button for completed tool calls
  const hasDetails = !!(path || command || content.rawInput);

  const effectiveStatus = status ?? content.status;
  const { border, bg, icon } = getStatusStyles(effectiveStatus, content.kind);

  return (
    <motion.div layout className={`${border} ${bg} overflow-hidden my-1.5 rounded-r-md`}>
      <div
        className={`flex items-center gap-2 px-3 py-2 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={hasDetails ? () => setExpanded(!expanded) : undefined}
      >
        <span className="text-notion-text-secondary">
          <ToolIcon kind={content.kind} />
        </span>
        <span className="font-medium text-sm text-notion-text flex-1 truncate">
          {content.title ?? content.kind ?? 'Tool Call'}
        </span>
        {icon}
        {hasDetails && (
          <span className="text-notion-text-tertiary">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {(path || command) && (
              <div className="px-3 pb-1.5 text-xs font-mono text-notion-text-secondary">
                {path ?? command}
              </div>
            )}
            {content.rawInput && (
              <pre className="px-3 py-2 text-xs font-mono bg-white/60 max-h-48 overflow-y-auto text-notion-text border-t border-white/40">
                {JSON.stringify(content.rawInput, null, 2)}
              </pre>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
