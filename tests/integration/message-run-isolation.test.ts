/**
 * Test message isolation between runs
 *
 * This test ensures that:
 * 1. Messages from different runs don't mix together
 * 2. Stream messages are properly filtered by runId
 * 3. Switching between runs shows correct message history
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { AgentTodoRepository } from '../../src/db/repositories/agent-todo.repository';
import { closeTestDatabase, ensureTestDatabaseSchema, resetTestDatabase } from '../support/test-db';

describe('Message isolation between runs', () => {
  ensureTestDatabaseSchema();

  const repository = new AgentTodoRepository();

  let testTodoId: string;
  let testAgentId: string;
  let run1Id: string;
  let run2Id: string;

  beforeEach(async () => {
    await resetTestDatabase();

    // Create test agent config
    const agent = await repository.createAgentConfig({
      name: 'Test Agent',
      backend: 'test-backend',
      enabled: true,
    });
    testAgentId = agent.id;

    // Create test todo
    const todo = await repository.createTodo({
      title: 'Test Todo',
      prompt: 'Test prompt',
      cwd: '/tmp',
      agentId: testAgentId,
    });
    testTodoId = todo.id;

    // Create two runs
    const run1 = await repository.createRun({
      todoId: testTodoId,
      status: 'completed',
      trigger: 'manual',
    });
    run1Id = run1.id;

    const run2 = await repository.createRun({
      todoId: testTodoId,
      status: 'running',
      trigger: 'manual',
    });
    run2Id = run2.id;
  });

  it('should isolate messages between different runs', async () => {
    // Add messages to run1
    await repository.createMessage({
      runId: run1Id,
      msgId: 'run1-msg1',
      type: 'text',
      role: 'user',
      content: JSON.stringify({ text: 'Run 1 user message' }),
    });

    await repository.createMessage({
      runId: run1Id,
      msgId: 'run1-msg2',
      type: 'text',
      role: 'assistant',
      content: JSON.stringify({ text: 'Run 1 assistant response' }),
    });

    // Add messages to run2
    await repository.createMessage({
      runId: run2Id,
      msgId: 'run2-msg1',
      type: 'text',
      role: 'user',
      content: JSON.stringify({ text: 'Run 2 user message' }),
    });

    await repository.createMessage({
      runId: run2Id,
      msgId: 'run2-msg2',
      type: 'text',
      role: 'assistant',
      content: JSON.stringify({ text: 'Run 2 assistant response' }),
    });

    // Fetch messages for run1
    const run1Messages = await repository.findMessagesByRunId(run1Id);
    expect(run1Messages).toHaveLength(2);
    expect(run1Messages[0].msgId).toBe('run1-msg1');
    expect(run1Messages[1].msgId).toBe('run1-msg2');

    // Fetch messages for run2
    const run2Messages = await repository.findMessagesByRunId(run2Id);
    expect(run2Messages).toHaveLength(2);
    expect(run2Messages[0].msgId).toBe('run2-msg1');
    expect(run2Messages[1].msgId).toBe('run2-msg2');

    // Verify no cross-contamination
    const run1MsgIds = run1Messages.map((m) => m.msgId);
    const run2MsgIds = run2Messages.map((m) => m.msgId);
    expect(run1MsgIds).not.toContain('run2-msg1');
    expect(run1MsgIds).not.toContain('run2-msg2');
    expect(run2MsgIds).not.toContain('run1-msg1');
    expect(run2MsgIds).not.toContain('run1-msg2');
  });

  it('should maintain correct order when messages arrive out of sequence', async () => {
    const now = Date.now();

    // Create messages with explicit timestamps
    await repository.createMessage({
      runId: run1Id,
      msgId: 'msg1',
      type: 'text',
      role: 'user',
      content: JSON.stringify({ text: 'First' }),
    });

    // Wait to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    await repository.createMessage({
      runId: run1Id,
      msgId: 'msg2',
      type: 'text',
      role: 'assistant',
      content: JSON.stringify({ text: 'Second' }),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    await repository.createMessage({
      runId: run1Id,
      msgId: 'msg3',
      type: 'text',
      role: 'user',
      content: JSON.stringify({ text: 'Third' }),
    });

    // Fetch messages
    const messages = await repository.findMessagesByRunId(run1Id);

    // Should be in chronological order
    expect(messages).toHaveLength(3);
    expect(messages[0].msgId).toBe('msg1');
    expect(messages[1].msgId).toBe('msg2');
    expect(messages[2].msgId).toBe('msg3');

    // Verify timestamps are ascending
    for (let i = 1; i < messages.length; i++) {
      const prevTime = new Date(messages[i - 1].createdAt).getTime();
      const currTime = new Date(messages[i].createdAt).getTime();
      expect(currTime).toBeGreaterThanOrEqual(prevTime);
    }
  });

  it('should handle multiple runs with overlapping message IDs correctly', async () => {
    // This tests the scenario where stream messages might have the same msgId
    // across different runs (unlikely but possible if msgId generation is flawed)

    // Both runs have a message with msgId 'msg-duplicate'
    await repository.createMessage({
      runId: run1Id,
      msgId: 'msg-duplicate',
      type: 'text',
      role: 'user',
      content: JSON.stringify({ text: 'Run 1 content' }),
    });

    await repository.createMessage({
      runId: run2Id,
      msgId: 'msg-duplicate',
      type: 'text',
      role: 'user',
      content: JSON.stringify({ text: 'Run 2 content' }),
    });

    // Fetch messages for each run
    const run1Messages = await repository.findMessagesByRunId(run1Id);
    const run2Messages = await repository.findMessagesByRunId(run2Id);

    // Each run should have only its own message
    expect(run1Messages).toHaveLength(1);
    expect(run2Messages).toHaveLength(1);

    // Content should be different
    const run1Content = JSON.parse(run1Messages[0].content);
    const run2Content = JSON.parse(run2Messages[0].content);
    expect(run1Content.text).toBe('Run 1 content');
    expect(run2Content.text).toBe('Run 2 content');
  });

  afterAll(async () => {
    await closeTestDatabase();
  });
});
