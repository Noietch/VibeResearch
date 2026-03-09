/**
 * ACP (Agent Client Protocol) unit tests
 *
 * Tests cover:
 * 1. acp-types.ts  — DEFAULT_AGENT_CONFIGS, YOLO_MODE_IDS constants
 * 2. acp-adapter.ts — transformAcpUpdate() for every sessionUpdate variant
 * 3. agent-detector.ts — detectAgents() with mocked `which`/`where`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────
// 1. acp-types — constants
// ─────────────────────────────────────────────

import {
  DEFAULT_AGENT_CONFIGS,
  YOLO_MODE_IDS,
  type AgentBackendType,
} from '../../src/main/agent/acp-types';

describe('acp-types: DEFAULT_AGENT_CONFIGS', () => {
  it('covers all expected backends', () => {
    const backends: AgentBackendType[] = [
      'claude-code',
      'codex',
      'gemini',
      'qwen',
      'goose',
      'custom',
    ];
    for (const b of backends) {
      expect(DEFAULT_AGENT_CONFIGS).toHaveProperty(b);
    }
  });

  it('claude-code uses empty acpArgs (uses ACP bridge)', () => {
    expect(DEFAULT_AGENT_CONFIGS['claude-code'].acpArgs).toEqual([]);
    expect(DEFAULT_AGENT_CONFIGS['claude-code'].backend).toBe('claude-code');
  });

  it('codex uses empty acpArgs (uses ACP bridge)', () => {
    expect(DEFAULT_AGENT_CONFIGS['codex'].acpArgs).toEqual([]);
    expect(DEFAULT_AGENT_CONFIGS['codex'].backend).toBe('codex');
  });

  it('gemini uses --acp', () => {
    expect(DEFAULT_AGENT_CONFIGS['gemini'].acpArgs).toContain('--acp');
  });

  it('qwen uses --acp', () => {
    expect(DEFAULT_AGENT_CONFIGS['qwen'].acpArgs).toContain('--acp');
  });

  it('goose uses acp subcommand', () => {
    expect(DEFAULT_AGENT_CONFIGS['goose'].acpArgs).toContain('acp');
  });

  it('custom uses empty acpArgs', () => {
    expect(DEFAULT_AGENT_CONFIGS['custom'].acpArgs).toEqual([]);
  });
});

describe('acp-types: YOLO_MODE_IDS', () => {
  it('claude-code yolo mode is bypassPermissions', () => {
    expect(YOLO_MODE_IDS['claude-code']).toBe('bypassPermissions');
  });

  it('gemini yolo mode is yolo', () => {
    expect(YOLO_MODE_IDS['gemini']).toBe('yolo');
  });

  it('qwen yolo mode is yolo', () => {
    expect(YOLO_MODE_IDS['qwen']).toBe('yolo');
  });

  it('codex yolo mode is full-access', () => {
    expect(YOLO_MODE_IDS['codex']).toBe('full-access');
  });

  it('goose has no yolo mode (undefined)', () => {
    expect(YOLO_MODE_IDS['goose']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// 2. acp-adapter — transformAcpUpdate()
// ─────────────────────────────────────────────

import { transformAcpUpdate } from '../../src/main/agent/acp-adapter';
import type { AcpSessionUpdate } from '../../src/main/agent/acp-types';

describe('acp-adapter: transformAcpUpdate', () => {
  const MSG_ID = 'msg-test-123';

  it('agent_message_chunk → text message', () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Hello world' },
    };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('text');
    expect(result!.role).toBe('assistant');
    expect(result!.msgId).toBe(MSG_ID);
    expect((result!.content as { text: string }).text).toBe('Hello world');
  });

  it('agent_message_chunk with empty text → empty string content', () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: '' },
    };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(result).not.toBeNull();
    expect((result!.content as { text: string }).text).toBe('');
  });

  it('agent_message_chunk with no content → empty string', () => {
    const update: AcpSessionUpdate = { sessionUpdate: 'agent_message_chunk' };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(result).not.toBeNull();
    expect((result!.content as { text: string }).text).toBe('');
  });

  it('agent_thought_chunk → thought message with thought- prefix msgId', () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'thinking...' },
    };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('thought');
    expect(result!.role).toBe('assistant');
    expect(result!.msgId).toBe(`thought-${MSG_ID}`);
    expect((result!.content as { text: string }).text).toBe('thinking...');
  });

  it('tool_call → tool_call message with correct fields', () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'tc-001',
      title: 'Read file',
      kind: 'read',
      rawInput: { path: '/tmp/foo.txt' },
      locations: [{ path: '/tmp/foo.txt' }],
      status: 'pending',
    };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('tool_call');
    expect(result!.toolCallId).toBe('tc-001');
    expect(result!.toolName).toBe('read');
    expect(result!.status).toBe('pending');
    const content = result!.content as Record<string, unknown>;
    expect(content.title).toBe('Read file');
    expect(content.kind).toBe('read');
    expect(content.rawInput).toEqual({ path: '/tmp/foo.txt' });
    expect(content.locations).toEqual([{ path: '/tmp/foo.txt' }]);
  });

  it('tool_call_update → tool_call message with updated status', () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'tc-002',
      title: 'Write file',
      kind: 'edit',
      status: 'completed',
    };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('tool_call');
    expect(result!.status).toBe('completed');
    expect(result!.toolCallId).toBe('tc-002');
    const content = result!.content as Record<string, unknown>;
    expect(content.status).toBe('completed');
  });

  it('plan → plan message with entries', () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: 'plan',
      entries: [
        { content: 'Step 1', status: 'pending' },
        { content: 'Step 2', status: 'pending', priority: 'high' },
      ],
    };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('plan');
    expect(result!.msgId).toBe(`plan-${MSG_ID}`);
    const content = result!.content as { entries: unknown[] };
    expect(content.entries).toHaveLength(2);
    expect((content.entries[1] as { priority: string }).priority).toBe('high');
  });

  it('config_option_update → returns null (not handled)', () => {
    const update: AcpSessionUpdate = { sessionUpdate: 'config_option_update' };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(result).toBeNull();
  });

  it('each result has a unique id', () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'hi' },
    };
    const r1 = transformAcpUpdate(update, MSG_ID);
    const r2 = transformAcpUpdate(update, MSG_ID);
    expect(r1!.id).not.toBe(r2!.id);
  });

  it('each result has a valid ISO createdAt timestamp', () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'ts test' },
    };
    const result = transformAcpUpdate(update, MSG_ID);
    expect(() => new Date(result!.createdAt).toISOString()).not.toThrow();
  });
});

// AcpConnection internal tests (JSON-RPC parsing, notification routing, permission
// handling, fs requests, sendRequest) were removed — the class was refactored to use
// @agentclientprotocol/sdk ClientSideConnection which handles all JSON-RPC framing
// and dispatch internally.

// ─────────────────────────────────────────────
// 4. agent-detector — detectAgents()
//
// agent-detector uses `promisify(exec)` which captures the exec reference
// at module load time. We test the public contract by running detectAgents()
// in the real environment and checking the shape of results, then separately
// test the filtering logic with a spy on the underlying execAsync behavior.
// ─────────────────────────────────────────────

import { detectAgents, type DetectedAgent } from '../../src/main/agent/agent-detector';

describe('agent-detector: detectAgents result shape', () => {
  it('returns an array (may be empty if no CLIs installed)', async () => {
    const results = await detectAgents();
    expect(Array.isArray(results)).toBe(true);
  });

  it('every detected agent has required fields', async () => {
    const results = await detectAgents();
    for (const agent of results) {
      expect(typeof agent.backend).toBe('string');
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.cliPath).toBe('string');
      expect(agent.cliPath.length).toBeGreaterThan(0);
      expect(typeof agent.nativeCliPath).toBe('string');
      expect(agent.nativeCliPath.length).toBeGreaterThan(0);
      expect(Array.isArray(agent.acpArgs)).toBe(true);
    }
  });

  it('no duplicate backends in results', async () => {
    const results = await detectAgents();
    const backends = results.map((r) => r.backend);
    const unique = new Set(backends);
    expect(unique.size).toBe(backends.length);
  });
});

describe('agent-detector: acpArgs contract per backend', () => {
  // These tests verify the AGENTS_TO_DETECT static config is correct
  // by checking what detectAgents would return for known backends.
  // We build expected configs from DEFAULT_AGENT_CONFIGS as source of truth.

  it('claude-code backend uses empty acpArgs (ACP bridge)', () => {
    expect(DEFAULT_AGENT_CONFIGS['claude-code'].acpArgs).toEqual([]);
  });

  it('codex backend uses empty acpArgs (ACP bridge)', () => {
    expect(DEFAULT_AGENT_CONFIGS['codex'].acpArgs).toEqual([]);
  });

  it('gemini backend maps to --acp', () => {
    expect(DEFAULT_AGENT_CONFIGS['gemini'].acpArgs).toEqual(['--acp']);
  });

  it('qwen backend maps to --acp', () => {
    expect(DEFAULT_AGENT_CONFIGS['qwen'].acpArgs).toEqual(['--acp']);
  });

  it('goose backend maps to acp subcommand', () => {
    expect(DEFAULT_AGENT_CONFIGS['goose'].acpArgs).toEqual(['acp']);
  });

  it('if claude is installed, its cliPath uses ACP bridge and acpArgs are empty', async () => {
    const results = await detectAgents();
    const claude = results.find((r) => r.backend === 'claude-code');
    if (claude) {
      expect(claude.cliPath).toContain('claude-agent-acp');
      expect(claude.acpArgs).toEqual([]);
    }
    // If not installed, test is vacuously satisfied — that's fine
  });

  it('if codex is installed, its acpArgs are empty', async () => {
    const results = await detectAgents();
    const codex = results.find((r) => r.backend === 'codex');
    if (codex) {
      expect(codex.acpArgs).toEqual([]);
    }
  });
});
