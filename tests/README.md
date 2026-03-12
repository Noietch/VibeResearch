# ResearchClaw Test Suite

## Test Environment Isolation

All tests run in complete isolation from production data. The test environment uses:

### Isolated Directories

- **Test Storage**: `tests/tmp/storage/` (vs production `~/.researchclaw/`)
- **Test Database**: `tests/tmp/integration.sqlite` (vs production `~/.researchclaw/researchclaw.db`)
- **Test VecStore**: `tests/tmp/storage/vec-store.json` (vs production `~/.researchclaw/vec-store.json`)

### How Isolation Works

1. **Environment Variables**: Tests set `RESEARCH_CLAW_STORAGE_DIR=tests/tmp/storage` and `NODE_ENV=test`
2. **Automatic Setup**: `tests/support/electron-mock.ts` initializes test environment before any imports
3. **Clean State**: Each test run clears `tests/tmp/` directory before starting
4. **No Side Effects**: Tests NEVER touch production data in `~/.researchclaw/`

### Verification

Run the isolation verification test:

```bash
npm run test -- tests/support/verify-isolation.test.ts
```

This confirms:

- ✅ `getStorageDir()` returns test directory
- ✅ `getDbPath()` returns test database path
- ✅ Environment variables are correctly set
- ✅ No production paths are used

## Test Categories

### Unit Tests (`tests/unit/`)

Fast, isolated tests for individual modules:

- `vec-store.test.ts` - Vector store operations
- `arxiv-extractor.test.ts` - arXiv metadata parsing
- `search-match.test.ts` - Search highlighting
- `tag-style.test.ts` - Tag color generation
- `short-id.test.ts` - Short ID generation
- `chat-prompt.test.ts` - Chat prompt templates
- `shell-env.test.ts` - Shell environment loading
- `resolve-command.test.ts` - Command resolution

### Integration Tests (`tests/integration/`)

End-to-end tests for service layers:

- `papers.test.ts` - Paper CRUD operations
- `reading.test.ts` - Reading notes
- `projects.test.ts` - Project management
- `tagging.test.ts` - Auto-tagging (requires API key)
- `citations.test.ts` - Citation extraction
- `ingest.test.ts` - Paper import workflows
- `acp.test.ts` - Agent Control Protocol
- `message-ordering.test.ts` - Chat message ordering
- `task-results.test.ts` - Task result storage

## Running Tests

```bash
# All tests
npm run test

# Specific test file
npm run test -- tests/unit/vec-store.test.ts

# Watch mode
npm run test:watch

# Pre-commit checks (integration tests only)
npm run precommit:check
```

## Test Database

The test database is automatically created and managed:

1. **Schema Creation**: `ensureTestDatabaseSchema()` runs `prisma db push` to create schema
2. **Data Reset**: `resetTestDatabase()` clears all tables between tests
3. **Cleanup**: `closeTestDatabase()` disconnects Prisma client

## Writing Tests

### Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('MyModule', () => {
  it('should do something', () => {
    // Test code
    expect(result).toBe(expected);
  });
});
```

### Integration Test Template

```typescript
import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ensureTestDatabaseSchema, resetTestDatabase, closeTestDatabase } from '../support/test-db';

describe('MyService', () => {
  ensureTestDatabaseSchema();

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('should work with database', async () => {
    // Test code using database
  });
});
```

### Tests Requiring API Keys

Use the `requiresModelIt` helper to skip tests when API keys are not available:

```typescript
import { requiresModelIt } from '../support/requires-model';

requiresModelIt('should call LLM API', async () => {
  // Test code that requires API key
});
```

This automatically skips the test in CI environments where API keys are not set.

## CI/CD

Tests run automatically on:

- Pre-commit hook (integration tests only)
- Pull request checks
- Main branch pushes

Environment variables in CI:

- `NODE_ENV=test` (automatically set)
- `RESEARCH_CLAW_STORAGE_DIR` (automatically set to test directory)
- API keys (not available in CI - tests are skipped)

## Troubleshooting

### Test Pollution

If tests are failing due to leftover data:

```bash
# Clean test directory
rm -rf tests/tmp/
npm run test
```

### Production Data Contamination

Tests should NEVER touch production data. If you suspect contamination:

1. Check `tests/support/verify-isolation.test.ts` passes
2. Verify `process.env.RESEARCH_CLAW_STORAGE_DIR` is set in test environment
3. Ensure `electron-mock.ts` is loaded before other imports

### VecStore Tests

VecStore unit tests use temporary directories (`mkdtempSync`) that are automatically cleaned up after each test. These are separate from the integration test storage directory.

## Test Coverage

Current coverage (as of 2026-03-12):

- 464 tests passing
- 48 tests skipped (require API keys or manual setup)
- All core functionality covered
