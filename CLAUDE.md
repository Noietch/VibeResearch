# Repository Rules for Claude Code

This file defines default engineering constraints for all changes in this repository.

## Project Overview

**Vibe Research** is a standalone Electron desktop app for researchers. It is NOT a Claude Code plugin.

```
src/
  main/       # Electron main process (IPC handlers, services, stores)
  renderer/   # Vite + React UI
  shared/     # Shared types, utils, prompts (no Node/Electron deps)
  db/         # Prisma client + repositories
prisma/       # schema.prisma
tests/        # Integration tests (service layer, no Electron needed)
scripts/      # build-main.mjs, build-release.sh
```

**Path aliases** (tsconfig + esbuild + vite + vitest):

- `@shared` → `src/shared/index.ts`
- `@db` → `src/db/index.ts`
- `@/*` → `src/renderer/*`

## Scope and Priority

- Scope: Entire repository (`vibe-research`).
- Priority: These rules are the default for every implementation unless the user gives explicit one-off overrides in a task.

## Mandatory standards

1. **Tests must cover real business chain**
   - Must include realistic sample import flow (Chrome history sample data).
   - Must cover paper -> reading card workflow.
   - Health/help-only tests are insufficient for feature acceptance.

2. **Every coding session must update `changelog.md`**
   - Append a concise entry under the relevant version/date section in `changelog.md` (root of repo).
   - Entry must summarize what changed and affected scope. No separate per-file entries needed.

3. **Formatting + lint/review checks must pass before commit**
   - Pre-commit checks are required.
   - Formatting, lint, and review-style static checks must pass.

4. **Database schema changes require migration**
   - When adding new features that modify `prisma/schema.prisma`, always run `npx prisma db push` to sync the database.
   - Remind user to run migration if schema changes are detected.
   - **Note**: Database path is `{VIBE_RESEARCH_STORAGE_DIR}/vibe-research.db` (defaults to `~/.vibe-research/vibe-research.db`). Update `.env` DATABASE_URL accordingly before running CLI commands.

5. **Commit working code immediately**
   - When a feature is functionally complete and passes type checks, commit it right away.
   - Use `git add` and `git commit` promptly to preserve work.
   - This prevents accidental loss of code from git operations (checkout, reset, etc.).
   - Commit message format: `feat/fix/refactor: brief description`

6. **Only commit and push files you modified**
   - Always use `git add <specific files>` — never `git add .` or `git add -A`.
   - Do not stage or push files you did not touch, even if they appear in `git status`.

7. **README must be updated in both Chinese and English**
   - `README.md` contains both English and Chinese sections.
   - When updating README, always update both language sections to keep them synchronized.

8. **Branch and PR workflow**
   - **Main branch (`main`) is protected and must only be updated via Pull Requests.**
   - Never push directly to `main` branch.
   - All feature development must be done in feature branches (e.g., `feat/feature-name`, `fix/bug-name`).
   - When feature work is complete, create a PR to merge into `main`.
   - Feature branches can be pushed directly for collaboration and backup.

## Expected coding sequence

1. Create changelog entry for the coding session.
2. Implement feature and tests.
3. Fill changelog test design + validation results.
4. Run formatting/lint/test checks.
5. Commit only when checks pass.

## UI Design Standards

### Card Component Colors

All card-style components (paper cards, reading cards, list items, etc.) use a **light blue + white** color scheme:

```tsx
// Card base styles
className = 'bg-white border border-notion-border rounded-lg';

// Card hover state
className = 'hover:bg-notion-accent-light hover:border-notion-accent/30';

// Card selected/active state
className = 'bg-notion-accent-light border-notion-accent/50';
```

**Color Palette (from tailwind.config.ts):**

| Purpose         | Tailwind Class            | Hex Value              | Usage                   |
| --------------- | ------------------------- | ---------------------- | ----------------------- |
| Card background | `bg-white`                | `#ffffff`              | Default card background |
| Card hover      | `bg-notion-accent-light`  | `#e8f4f8`              | Light blue hover state  |
| Card border     | `border-notion-border`    | `#e8e8e5`              | Default border          |
| Accent border   | `border-notion-accent/30` | `rgba(46,170,220,0.3)` | Hover/active border     |
| Accent text     | `text-notion-accent`      | `#2eaadc`              | Highlights, links       |

**Card Design Principles:**

1. **Background**: White (`#ffffff`) by default
2. **Hover**: Light blue background (`#e8f4f8`) with subtle blue border
3. **Active/Selected**: Light blue background with more prominent blue border
4. **Borders**: Light gray default, transitions to light blue on interaction
5. **Shadows**: Use `shadow-notion` for subtle elevation, `shadow-notion-hover` on hover

### Example Card Pattern

```tsx
<div
  className="group bg-white border border-notion-border rounded-lg p-4
  hover:bg-notion-accent-light hover:border-notion-accent/30
  transition-colors duration-150 cursor-pointer"
>
  {/* Card content */}
</div>
```

## UI Animation Standards

All modal/popup animations use framer-motion with this standard pattern:

```tsx
import { motion, AnimatePresence } from 'framer-motion';

<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
        className="rounded-xl bg-white p-6 shadow-xl"
      >
        {/* Modal content */}
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>;
```

- **Background**: fade in/out (`opacity: 0 → 1`)
- **Card**: scale + slide up (`scale: 0.95 → 1`, `y: 10 → 0`)
- **Duration**: 150ms for all transitions
- **ESC key**: Always support ESC to close modals
