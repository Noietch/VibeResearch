import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readChromeHistoryEntries } from '../../src/main/services/ingest.service';

// node:sqlite is used to create WAL-backed Chrome history fixtures
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

function createWalBackedChromeHistoryDb(
  entries: Array<{ title: string; url: string; lastVisitTime?: number }>,
): {
  dirPath: string;
  historyPath: string;
  close: () => void;
} {
  const dirPath = path.join(
    os.tmpdir(),
    `chrome-history-wal-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  fs.mkdirSync(dirPath, { recursive: true });

  const historyPath = path.join(dirPath, 'History');
  const db = new DatabaseSync(historyPath);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      visit_count INTEGER DEFAULT 0,
      typed_count INTEGER DEFAULT 0,
      last_visit_time INTEGER NOT NULL,
      hidden INTEGER DEFAULT 0
    )
  `);

  const epochDiff = 11644473600000;
  const nowChromeTime = (Date.now() + epochDiff) * 1000;

  for (const entry of entries) {
    db.prepare('INSERT INTO urls (url, title, last_visit_time) VALUES (?, ?, ?)').run(
      entry.url,
      entry.title,
      entry.lastVisitTime ?? nowChromeTime,
    );
  }

  return {
    dirPath,
    historyPath,
    close: () => db.close(),
  };
}

describe('chrome history reader', () => {
  it('reads a WAL-backed Chrome history database without losing the urls table', async () => {
    const fixture = createWalBackedChromeHistoryDb([
      { title: 'Transformer Paper', url: 'https://arxiv.org/abs/1706.03762' },
      { title: 'Non-arXiv site', url: 'https://example.com/page' },
    ]);

    try {
      const entries = await readChromeHistoryEntries(fixture.historyPath, 30);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({
        title: 'Transformer Paper',
        url: 'https://arxiv.org/abs/1706.03762',
      });
    } finally {
      fixture.close();
      fs.rmSync(fixture.dirPath, { recursive: true, force: true });
    }
  });

  it('throws a clear error when the sqlite file is not a Chrome history database', async () => {
    const invalidDbPath = path.join(
      os.tmpdir(),
      `chrome-history-invalid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
    );
    const db = new DatabaseSync(invalidDbPath);
    db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT)');
    db.close();

    try {
      await expect(readChromeHistoryEntries(invalidDbPath, 7)).rejects.toThrow(
        /missing urls table/i,
      );
    } finally {
      fs.rmSync(invalidDbPath, { force: true });
    }
  });
});
