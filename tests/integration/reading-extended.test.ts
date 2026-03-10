/**
 * Extended integration tests for ReadingService
 *
 * Tests cover:
 *  - Create, retrieve, update, delete reading notes
 *  - listByPaper returns all notes for a paper
 *  - Multiple notes per paper
 *  - Note types: 'paper' and 'code'
 *  - saveChat creates and updates chat notes
 *  - delete removes note
 *  - Updating content merges keys
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDatabase, ensureTestDatabaseSchema, resetTestDatabase } from '../support/test-db';
import { PapersService } from '../../src/main/services/papers.service';
import { ReadingService } from '../../src/main/services/reading.service';

// Mock vec-client to avoid sqlite-vec dependency in tests
vi.mock('../../src/db/vec-client', () => ({
  getVecDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []), get: vi.fn() })),
    transaction: vi.fn((fn: Function) => fn),
  })),
  closeVecDb: vi.fn(),
}));

describe('ReadingService extended', () => {
  ensureTestDatabaseSchema();

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  async function createTestPaper(title = 'Test Paper') {
    const papersService = new PapersService();
    return papersService.create({
      title,
      source: 'manual',
      tags: [],
    });
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a reading note with structured content', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const note = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'My Reading Notes',
        content: {
          'Research Problem': 'What is the problem?',
          'Core Method': 'The proposed method',
          Contributions: 'Key contributions',
        },
      });

      expect(note.id).toBeDefined();
      expect(note.title).toBe('My Reading Notes');
      expect(note.type).toBe('paper');
      expect(note.paperId).toBe(paper.id);
      expect(note.content['Research Problem']).toBe('What is the problem?');
      expect(note.content['Core Method']).toBe('The proposed method');
    });

    it('creates a code-type reading note', async () => {
      const paper = await createTestPaper('Code Paper');
      const service = new ReadingService();

      const note = await service.create({
        paperId: paper.id,
        type: 'code',
        title: 'Code Review Notes',
        content: {
          Architecture: 'ResNet-50 backbone',
          'Training Details': 'SGD with momentum',
        },
      });

      expect(note.type).toBe('code');
      expect(note.content['Architecture']).toBe('ResNet-50 backbone');
    });

    it('creates note with empty content', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const note = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Empty Note',
        content: {},
      });

      expect(note.id).toBeDefined();
      expect(note.content).toEqual({});
    });

    it('creates multiple notes for the same paper', async () => {
      const paper = await createTestPaper('Multi-note Paper');
      const service = new ReadingService();

      await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Note 1',
        content: { section: 'First note' },
      });

      await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Note 2',
        content: { section: 'Second note' },
      });

      const notes = await service.listByPaper(paper.id);
      expect(notes.length).toBe(2);
    });
  });

  // ── List by paper ──────────────────────────────────────────────────────────

  describe('listByPaper', () => {
    it('returns all notes for a paper', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const note1 = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Note A',
        content: { key: 'value A' },
      });

      const note2 = await service.create({
        paperId: paper.id,
        type: 'code',
        title: 'Note B',
        content: { key: 'value B' },
      });

      const notes = await service.listByPaper(paper.id);
      expect(notes.length).toBe(2);

      const ids = notes.map((n) => n.id);
      expect(ids).toContain(note1.id);
      expect(ids).toContain(note2.id);
    });

    it('returns empty array for paper with no notes', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const notes = await service.listByPaper(paper.id);
      expect(notes).toHaveLength(0);
    });

    it('does not return notes from other papers', async () => {
      const paper1 = await createTestPaper('Paper 1');
      const paper2 = await createTestPaper('Paper 2');
      const service = new ReadingService();

      await service.create({
        paperId: paper1.id,
        type: 'paper',
        title: 'Paper 1 Note',
        content: {},
      });

      const paper2Notes = await service.listByPaper(paper2.id);
      expect(paper2Notes).toHaveLength(0);
    });
  });

  // ── Update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates content of a note', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const note = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Updatable Note',
        content: {
          'Research Problem': 'Initial content',
          'Core Method': 'Initial method',
        },
      });

      const updated = await service.update(note.id, {
        'Research Problem': 'Updated content',
        'Core Method': 'Updated method',
        'New Section': 'New content',
      });

      expect(updated.content['Research Problem']).toBe('Updated content');
      expect(updated.content['Core Method']).toBe('Updated method');
      expect(updated.content['New Section']).toBe('New content');
    });

    it('can set content to empty object', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const note = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Note',
        content: { key: 'value' },
      });

      const updated = await service.update(note.id, {});
      expect(updated.content).toEqual({});
    });
  });

  // ── getById ────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('retrieves a note by id', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const note = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Findable Note',
        content: { key: 'value' },
      });

      const found = await service.getById(note.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(note.id);
      expect(found!.title).toBe('Findable Note');
    });
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes a note from the database', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const note = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Note to Delete',
        content: {},
      });

      await service.delete(note.id);

      const notes = await service.listByPaper(paper.id);
      expect(notes).toHaveLength(0);
    });

    it('deleting one note does not affect others', async () => {
      const paper = await createTestPaper();
      const service = new ReadingService();

      const note1 = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Keep This',
        content: {},
      });

      const note2 = await service.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Delete This',
        content: {},
      });

      await service.delete(note2.id);

      const notes = await service.listByPaper(paper.id);
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe(note1.id);
    });
  });

  // ── saveChat ───────────────────────────────────────────────────────────────

  describe('saveChat', () => {
    it('creates a new chat note when noteId is null', async () => {
      const paper = await createTestPaper('Chat Paper');
      const service = new ReadingService();

      const messages = [
        { role: 'user', content: 'What is this paper about?' },
        { role: 'assistant', content: 'This paper is about transformers.' },
      ];

      const result = await service.saveChat({
        paperId: paper.id,
        noteId: null,
        messages,
      });

      expect(result.id).toBeDefined();

      const notes = await service.listByPaper(paper.id);
      expect(notes).toHaveLength(1);
    });

    it('updates existing chat note when noteId is provided', async () => {
      const paper = await createTestPaper('Chat Update Paper');
      const service = new ReadingService();

      // Create initial chat
      const initial = await service.saveChat({
        paperId: paper.id,
        noteId: null,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // Update with more messages
      const updated = await service.saveChat({
        paperId: paper.id,
        noteId: initial.id,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      });

      expect(updated.id).toBe(initial.id);

      // Should still be one note
      const notes = await service.listByPaper(paper.id);
      expect(notes).toHaveLength(1);
    });
  });

  // ── Full workflow ──────────────────────────────────────────────────────────

  describe('full reading workflow', () => {
    it('simulates complete paper reading lifecycle', async () => {
      const papersService = new PapersService();
      const readingService = new ReadingService();

      // 1. Import paper
      const paper = await papersService.create({
        title: 'BERT: Pre-training of Deep Bidirectional Transformers',
        authors: ['Devlin', 'Chang', 'Lee', 'Toutanova'],
        source: 'arxiv',
        sourceUrl: 'https://arxiv.org/abs/1810.04805',
        submittedAt: new Date('2018-10-11T00:00:00Z'),
        abstract: 'We introduce BERT, a new language representation model.',
        tags: ['nlp', 'language-model', 'bert'],
      });

      // 2. Create reading notes
      const note = await readingService.create({
        paperId: paper.id,
        type: 'paper',
        title: 'Reading: BERT',
        content: {
          'Research Problem': '',
          'Core Method': '',
          Contributions: '',
          Limitations: '',
        },
      });

      expect(note.id).toBeDefined();

      // 3. Update notes after reading
      const updated = await readingService.update(note.id, {
        'Research Problem': 'Pre-training language representations for NLP tasks',
        'Core Method': 'Masked language modeling + next sentence prediction',
        Contributions:
          'First deeply bidirectional language model, state-of-the-art on 11 NLP tasks',
        Limitations: 'Large model size, slow inference',
      });

      expect(updated.content['Research Problem']).toContain('Pre-training');
      expect(updated.content['Core Method']).toContain('Masked language modeling');

      // 4. Verify notes persist
      const notes = await readingService.listByPaper(paper.id);
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe(note.id);

      // 5. Add a chat session
      await readingService.saveChat({
        paperId: paper.id,
        noteId: null,
        messages: [
          { role: 'user', content: 'What makes BERT different from GPT?' },
          { role: 'assistant', content: 'BERT is bidirectional while GPT is unidirectional.' },
        ],
      });

      const allNotes = await readingService.listByPaper(paper.id);
      expect(allNotes).toHaveLength(2); // reading note + chat

      // 6. Delete reading note
      await readingService.delete(note.id);
      const remainingNotes = await readingService.listByPaper(paper.id);
      expect(remainingNotes).toHaveLength(1); // only chat remains
    });
  });
});
