# Changelog

## 2026-03-07

### Fix: Restore Model Edit Functionality

- **Scope**: `src/renderer/pages/settings/page.tsx`, `CLAUDE.md`
- **Changes**:
  - Added Edit button to ModelCard component (next to Test/Activate/Delete buttons)
  - Created EditModelModal component that pre-fills existing model configuration
  - Fetches API key via `ipc.getModelApiKey()` when editing API models
  - Uses same form layout as AddModelModal but with "Save" instead of "Add"
  - Added "Commit working code immediately" rule to CLAUDE.md to prevent code loss
- **Rationale**: Edit functionality was mentioned in changelog but never committed; users need to modify saved model configs
- **Test Design**: Open Settings > Models tab, click edit on any model, verify form is pre-filled
- **Validation**: TypeScript compiles for settings/page.tsx

### Feature: Restore Structured Notes Template

- **Scope**: `src/main/services/reading.service.ts`, `src/renderer/pages/papers/reader/page.tsx`
- **Changes**:
  - Restored structured notes template with fields: Research Problem, Core Method, Key Findings, Limitations, Future Work
  - Added chat header with New Chat and Generate Notes buttons
  - Generate Notes button creates structured reading notes from chat conversation
  - Changed stop button color from bright red to gray for less visual distraction
  - Notes generation includes JSON parsing with fallback to simple summary
- **Rationale**: Users need structured notes for better paper analysis and organization
- **Test Design**: Manual UI testing - chat about a paper, click Generate Notes to create structured notes
- **Validation**: TypeScript compiles

## 2026-03-07

### Fix: Test database connection issue

- **Scope**: `src/db/client.ts`
- **Changes**: Fixed `getPrismaClient()` to respect existing `DATABASE_URL` environment variable instead of always overriding it
- **Rationale**: Tests were failing because `getPrismaClient()` was overriding the test database URL with the production database path, causing "category column does not exist" errors
- **Test Design**: Run `npm run precommit:check` — all tests pass
- **Validation**: All 14 tests pass

### Feature: Multi-Layer Tag System - UI Layer

- **Scope**: `src/renderer/hooks/use-ipc.ts`, `src/renderer/pages/papers/overview/page.tsx`, `src/renderer/components/papers-by-tag.tsx`, `src/renderer/components/tag-management-modal.tsx`
- **Changes**:
  - Updated `use-ipc.ts` with tagging IPC client methods (tagPaper, organizePaper, mergeTag, recategorizeTag, renameTag, deleteTag, suggestConsolidation, etc.)
  - Replaced TagEditor in overview page with 3-layer category display (domain/method/topic)
  - Added "Auto Tag" button (AI generates categorized tags from paper content)
  - Added "Organize" button (AI re-categorizes existing tags)
  - Per-category tag input with autocomplete suggestions
  - Category-based color coding (domain=blue, method=purple, topic=green)
  - Updated Library page with category filter tabs (All/Domain/Method/Topic)
  - Added "Batch Auto Tag" button to trigger background tagging for all untagged papers
  - Added tagging progress indicator with progress bar
  - Created TagManagementModal with two tabs:
    - Browse: List all tags grouped by category with rename, recategorize, delete actions
    - AI Consolidate: Suggest and apply tag merges and recategorizations
  - Tag display now uses categorized tags from PaperItem.categorizedTags field
- **Rationale**: UI layer for multi-layer tag system - enables researchers to organize papers by domain/method/topic
- **Test Design**: Import papers → verify background tagging triggers → check categorized tags display in overview and library pages
- **Validation**: TypeScript compiles

## 2026-03-07

### UX: Reduce Rating Prompt Frequency

- **Scope**: `src/renderer/pages/papers/reader/page.tsx`
- **Changes**:
  - Rating prompt now shows with 10% probability instead of always
  - Added 7-day cooldown per paper after showing prompt
  - Uses localStorage to track last prompt time per paper
- **Rationale**: Rating prompt was too intrusive, appearing every time user left reader page
- **Test Design**: Exit reader page multiple times, verify prompt shows ~10% of the time and not again within 7 days
- **Validation**: TypeScript compiles

## 2026-03-07

### UI: Remove "Key saved" badge from model cards

- **Scope**: `src/renderer/pages/settings/page.tsx`
- **Changes**: Removed the green "Key saved" badge that appeared on API models with saved keys
- **Rationale**: Cleaner UI, key status is implicit when model is functional
- **Test Design**: Open Settings > Models tab, verify no "Key saved" badge appears
- **Validation**: TypeScript compiles

## 2026-03-07

### UI: Animated Token Usage Charts with @nivo

- **Scope**: `src/renderer/pages/settings/page.tsx`, `package.json`
- **Changes**:
  - Replaced recharts with @nivo/line and @nivo/calendar for animated charts
  - Line chart now has smooth "gentle" animation, area fill, interactive tooltips
  - Added GitHub-style calendar heatmap showing last 90 days of token usage
  - Calendar uses blue gradient (#bfdbfe → #1d4ed8) for activity intensity
  - Both charts have consistent styling and responsive containers
  - Removed recharts import (still in dependencies for potential future use)
- **Rationale**: @nivo provides better animations and more polished visual appearance
- **Test Design**: Open Settings > Usage tab, verify animated charts display correctly
- **Validation**: TypeScript compiles, no runtime errors

## 2026-03-07

### Feature: Multi-Layer Tag System

- **Scope**: `prisma/schema.prisma`, `src/shared/types/domain.ts`, `src/shared/prompts/tagging.prompt.ts`, `src/db/repositories/papers.repository.ts`, `src/main/services/tagging.service.ts`, `src/main/ipc/tagging.ipc.ts`, `src/renderer/pages/papers/overview/page.tsx`, `src/renderer/components/papers-by-tag.tsx`, `src/renderer/components/tag-management-modal.tsx`
- **Changes**:
  - Added `category` field to Tag model (domain/method/topic)
  - Created tagging prompt templates for AI categorization
  - Added tagging.service.ts with auto-tagging, keyword fallback, and batch processing
  - Added tag management IPC handlers (tagPaper, organizePaper, merge, recategorize, rename, delete)
  - Updated TagEditor in overview page with 3-layer category display (blue/purple/green)
  - Added "Auto Tag" and "Organize" buttons in paper overview
  - Added category filter tabs in Library page
  - Added tag management modal with browse and AI consolidation features
  - Background auto-tagging triggered after paper import
- **Rationale**: Flat tags lack structure; researchers need domain/method/topic organization for better paper discovery
- **Test Design**: Import papers → verify background tagging starts → check categorized tags in overview
- **Validation**: Pending

## 2026-03-07

### UI: Separate Proxy Settings Tab

- **Scope**: `src/renderer/pages/settings/page.tsx`
- **Changes**:
  - Created standalone `ProxySettings` component for HTTP/SOCKS proxy configuration
  - Added "Proxy" tab in Settings navigation (between Storage and Usage)
  - Proxy now has its own dedicated settings section with Save button
- **Rationale**: Cleaner organization, proxy settings are independent from storage settings
- **Test Design**: Manual UI testing in Settings page
- **Validation**: Build passes, type check passes, integration tests pass
- **Note**: Also restored UsageSettings component (token usage visualization) that was lost during git checkout

## 2026-03-07

### UI: Chat Panel Improvements

- **Scope**: `src/renderer/pages/papers/reader/page.tsx`, `src/main/services/reading.service.ts`
- **Changes**:
  - Removed structured notes template (Research Problem, Core Method, etc.) - now generates simple summary
  - Added "Save as summary" button in chat header (above input area)
  - Changed stop button color from bright red to gray for less visual distraction
  - Moved "New Chat" button from dropdown menu to chat panel header
  - Summary generates a single "Summary" field instead of multiple structured fields
- **Rationale**: Cleaner UI, simpler notes workflow, less intrusive stop button
- **Test Design**: Manual UI testing in Electron app
- **Validation**: Build passes

## 2026-03-07

### Feature: Token Usage Tracking with Charts

- **Scope**: `src/main/store/token-usage-store.ts`, `src/main/ipc/token-usage.ipc.ts`, `src/main/services/ai-provider.service.ts`, `src/main/services/agentic-search.service.ts`, `src/main/index.ts`, `src/renderer/hooks/use-ipc.ts`, `src/renderer/pages/settings/page.tsx`
- **Changes**:
  - Created token usage store to track all AI API calls
  - Records: timestamp, provider, model, promptTokens, completionTokens, totalTokens, kind (agent/lightweight/chat/other)
  - Added `recordTokenUsage()`, `getTokenUsageRecords()`, `clearTokenUsage()` functions
  - Token recording integrated into all `generateText()` calls in ai-provider.service.ts
  - Token recording added to agentic search service
  - Added IPC handlers: `tokenUsage:getRecords`, `tokenUsage:clear`
  - Added "Usage" tab in Settings showing:
    - Summary cards: Total tokens, API calls
    - Line chart: Token usage over time (hourly), with different lines for each model
    - GitHub-style heatmap: Activity over last 12 weeks showing token consumption
    - Clear usage data button
  - Added `recharts` dependency for line chart visualization
- **Rationale**: Users need visibility into their AI API consumption with visual charts
- **Test Design**: Use AI features (chat, agentic search), then check Usage tab in Settings
- **Validation**: TypeScript compiles, all tests pass

## 2026-03-07

### Feature: Chat-to-Notes Binding

- **Scope**: `prisma/schema.prisma`, `src/shared/types/domain.ts`, `src/db/repositories/reading.repository.ts`, `src/main/services/reading.service.ts`, `src/main/ipc/reading.ipc.ts`, `src/renderer/hooks/use-ipc.ts`, `src/renderer/pages/papers/reader/page.tsx`
- **Changes**:
  - Added `chatNoteId` field to ReadingNote model for 1:1 self-relation between Chat and generated Notes
  - Chat sessions can now be converted to structured reading notes via AI
  - Added `getGeneratedNote(chatNoteId)` repository method to check for existing generated notes
  - Added `generateNotesFromChat(chatNoteId)` service method with structured prompt
  - Added `reading:generateNotes` IPC handler
  - Added "Generate Notes" button in chat dropdown menu with loading/success states
  - Generated notes linked to original chat session (one chat → one note)
  - Fixed syntax error in `use-ipc.ts` onIpc function signature
- **Rationale**: Users want to convert chat conversations into structured reading notes automatically
- **Test Design**: Manual UI testing - chat about a paper, then click "Generate Notes" to create structured notes
- **Validation**: Build passes, all tests pass

## 2026-03-07

### Feature: Agentic Search with AI SDK Tool Calling

- **Scope**: `src/main/services/agentic-search.service.ts`, `src/renderer/hooks/use-ipc.ts`, `src/renderer/components/search-content.tsx`
- **Changes**:
  - Rewrote agentic search to use AI SDK's native tool calling and multi-step agent loop
  - Defined 4 tools the AI can autonomously call:
    - `searchByTitle`: Precise title matching
    - `searchByTag`: Topic-based search
    - `searchByText`: Broad search across title, tags, and abstract
    - `listAllTags`: Discover available topics
  - Agent can run up to 5 steps, iterating based on results
  - Added `reasoning` step type to show AI's thinking process
  - Each paper now tracks multiple match reasons
  - Fallback to simple text search if agent loop fails
- **Rationale**: Previous implementation just used AI for keyword extraction, not true agentic behavior. AI SDK's `generateText` with tools enables the AI to plan, execute, and refine searches autonomously.
- **Test Design**: Manual UI testing - use Agentic search mode, observe multi-step reasoning
- **Validation**: TypeScript compiles

## 2026-03-07

### Fix: API Key Display in Edit Model Modal

- **Scope**: `src/renderer/pages/settings/page.tsx`
- **Changes**:
  - API key now displays in plain text by default (no need to click eye icon)
  - Changed `showKey` initial state from `false` to `true` in both AddModelModal and EditModelModal
  - Local desktop app has no security concern for showing API keys
- **Rationale**: Users should be able to see their saved API keys immediately without extra click
- **Test Design**: Open Edit Model modal, verify API key is visible without clicking eye icon
- **Validation**: TypeScript compiles

# Changelog

## 2026-03-07

### Feature: Editor Test Button

- **Scope**: `src/renderer/pages/settings/page.tsx`, `src/main/ipc/providers.ipc.ts`, `src/main/services/providers.service.ts`, `src/main/store/app-settings-store.ts`, `src/renderer/hooks/use-ipc.ts`
- **Changes**:
  - Added "Test: Open Storage Root" button in Editor settings
  - Added `getStorageRoot` IPC method to get storage root directory path
  - Button opens storage root (`~/.vibe-research`) in configured editor
- **Rationale**: Allow users to verify editor configuration works correctly
- **Test Design**: Click test button in Settings > Editor tab, verify editor opens with storage root
- **Validation**: TypeScript compiles

## 2026-03-07

### Fix: Chat Stuck on "正在思考"

- **Scope**: `src/main/services/reading.service.ts`
- **Changes**:
  - Fixed `streamText` call that incorrectly used both `messages` and `prompt` parameters simultaneously
  - Vercel AI SDK does not support using both parameters at the same time
  - Now correctly passes all messages in the `messages` array only
- **Rationale**: The mixed parameters caused the stream to hang without returning any response
- **Test Design**: Manual UI testing - send chat message, verify response streams back
- **Validation**: TypeScript compiles

## 2026-03-07

### Feature: Proxy Settings & PDF URL Auto-Extract

- **Scope**: `src/renderer/pages/settings/page.tsx`, `src/main/store/app-settings-store.ts`, `src/main/services/download.service.ts`, `src/main/services/ai-provider.service.ts`, `src/main/services/cli-runner.service.ts`, `src/main/services/reading.service.ts`, `src/main/ipc/reading.ipc.ts`, `src/renderer/pages/papers/reader/page.tsx`, `src/renderer/hooks/use-ipc.ts`, `src/renderer/components/import-modal.tsx`
- **Changes**:
  - Added proxy configuration in Settings (HTTP/SOCKS proxy URL)
  - Proxy used for: PDF downloads, AI API calls, CLI tools (optional per-tool)
  - Added "Use Proxy" toggle for each CLI tool (injects HTTP_PROXY/HTTPS_PROXY env vars)
  - Added "Auto Extract URL" button in reader page using lightweight model
  - Extracted PDF URL shown for user confirmation before download
  - User can manually edit the URL before downloading
  - Fixed TypeScript error in import-modal.tsx (onIpc callback type)
- **Rationale**: Users in restricted networks need proxy support; some papers don't have obvious PDF URLs
- **Test Design**: Manual UI testing in Electron app
- **Validation**: TypeScript compiles

## 2026-03-07

### UI: Library Year Dropdown Improvement

- **Scope**: `src/renderer/components/papers-by-tag.tsx`
- **Changes**:
  - Replaced native `<select>` dropdown with custom `YearDropdown` component
  - Button style now matches other filter buttons (rounded-lg, consistent padding/colors)
  - Added framer-motion animation for dropdown open/close
  - Click outside to close
  - Selected year shows in button, "More" when unselected
  - Chevron icon rotates when dropdown opens
- **Rationale**: Native select element looks inconsistent with app's Notion-like design
- **Test Design**: Manual UI testing
- **Validation**: TypeScript compiles

## 2026-03-07

### Fix: AI/CLI调用链架构问题修复

- **Scope**: `src/main/services/reading.service.ts`, `src/main/store/cli-tools-store.ts`, `src/main/services/ai-provider.service.ts`, `src/main/services/models.service.ts`, `src/main/services/providers.service.ts`, `src/main/ipc/models.ipc.ts`, `src/main/ipc/providers.ipc.ts`
- **Changes**:
  - 修复 `reading.service.ts` 缺失 `generateWithModelKind` import（导致运行时崩溃）
  - CLI工具配置现在加密存储敏感信息（envVars中的API KEY）
  - 提取 Models 和 Providers service 层，IPC handler 不再直接访问 store
  - 实现 CLI Backend 模型执行路径（`backend: 'cli'` 现在可用）
- **Rationale**: 修复架构缺陷，提升安全性和代码可维护性
- **Test Design**: 集成测试覆盖service层
- **Validation**: Pending

## 2026-03-07

### Settings: Edit Model & View API Key

- **Scope**: `src/renderer/pages/settings/page.tsx`, `src/renderer/hooks/use-ipc.ts`, `src/main/ipc/models.ipc.ts`
- **Changes**:
  - Added edit functionality for all models (including active ones)
  - EditModelModal with pre-filled configuration
  - API Key now visible when editing (local app, no security concern)
  - Removed "Key saved" badge from model cards
  - Added `models:getApiKey` IPC to return full API key
  - Added `getModelApiKey()` to IPC client
- **Rationale**: Local desktop app users should be able to view and modify their saved API keys
- **Test Design**: Manual UI testing - edit model, verify API key is visible
- **Validation**: TypeScript compiles, no errors

### Chat: Use Chat Model Instead of CLI Tool

- **Scope**: `src/renderer/pages/papers/reader/page.tsx`, `src/main/services/reading.service.ts`, `src/main/ipc/reading.ipc.ts`, `src/renderer/hooks/use-ipc.ts`
- **Changes**:
  - Chat now uses the "chat" model configured in Settings instead of CLI tool
  - Added `ReadingService.chat()` method with streaming support
  - Added `reading:chat` and `reading:chatKill` IPC handlers
  - Streaming output via `chat:output`, `chat:done`, `chat:error` events
  - Updated reader page to show chat model name instead of CLI tool name
  - Removed CLI tool dependencies from chat functionality
- **Rationale**: Agent (CLI-based) is only for code analysis; chat should use API-based models
- **Test Design**: Manual UI testing in Electron app
- **Validation**: Build passes

### Feature: Proxy Settings & PDF URL Extraction

- **Scope**: `src/main/store/app-settings-store.ts`, `src/main/ipc/providers.ipc.ts`, `src/main/services/download.service.ts`, `src/renderer/pages/settings/page.tsx`, `src/renderer/pages/papers/reader/page.tsx`, `src/renderer/hooks/use-ipc.ts`
- **Changes**:
  - Added proxy configuration in Settings (HTTP/SOCKS proxy URL)
  - PDF download now uses configured proxy for network requests
  - Added "Auto Extract" button in reader page to extract PDF URL using lightweight model
  - Extracted URL shown for user confirmation before download
  - User can manually edit or input PDF URL
  - Download failures now show hint to check proxy settings
- **Test Design**: Manual UI testing in Electron app
- **Validation**: Pending

### Fix: Library Select All Not Working

- **Scope**: `src/renderer/components/papers-by-tag.tsx`
- **Changes**:
  - Fixed `selectAll` callback missing `visiblePapers` dependency
  - Without the dependency, the callback captured stale closure value (empty array on mount)
  - Now correctly selects all visible papers after filters are applied
- **Test Design**: Manual UI testing
- **Validation**: Build passes

### Chat: Response Timeout with Settings Link

- **Scope**: `src/renderer/pages/papers/reader/page.tsx`
- **Changes**:
  - Added 30-second timeout for AI chat responses
  - When timeout occurs, shows error message with current CLI tool name
  - Added direct link to Settings page to test connection
  - Timeout is cleared when any response is received (cli:output, cli:error, cli:done)
  - Timeout is also cleared on new chat, select chat, clear chat, and component unmount
- **Test Design**: Manual UI testing in Electron app
- **Validation**: Build passes

### PDF Text Storage: Local Files Instead of Database

- **Scope**: `prisma/schema.prisma`, `src/main/services/paper-text.service.ts`, `src/db/repositories/papers.repository.ts`, `src/main/services/reading.service.ts`
- **Changes**:
  - Removed `textContent` and `textExtractedAt` fields from Paper model
  - Added `textPath` field to store path to local text file
  - PDF extracted text now saved to `papers/{shortId}/text.txt` instead of database
  - `getPaperExcerptCached()` now requires `shortId` parameter for file path resolution
  - Replaced `updateTextContent()` and `getTextContent()` with single `updateTextPath()` method
- **Rationale**: Storing large text content in SQLite bloats the database; local files are more efficient
- **Test Design**: Manual testing in Electron app
- **Validation**: Build passes, all 21 tests pass

## 2026-03-07

### Settings: UX Improvements & API Connection Test

- **Scope**: `src/renderer/pages/settings/page.tsx`, `src/renderer/components/model-combobox.tsx`, `src/main/store/model-config-store.ts`, `src/main/services/ai-provider.service.ts`, `src/main/ipc/models.ipc.ts`, `src/renderer/hooks/use-ipc.ts`
- **Changes**:
  - Removed "搜索模型或直接输入自定义ID" hint from model dropdown
  - Changed default API provider from Anthropic to OpenAI
  - Auto-activate first model when no active model exists for that kind
  - Added "Test Connection" button for API models (both in Add modal and saved cards) with real-time feedback
  - Test sends minimal request to verify API key and endpoint validity
  - Shows success/failure message after test
- **Test Design**: Manual UI testing in Electron app
- **Validation**: Build passes, type check passes, integration tests pass
- **Note**: Also restored UsageSettings component (token usage visualization) that was lost during git checkout, all tests pass

### Chat: New Chat & Clear Chat Buttons

- **Scope**: `src/renderer/pages/papers/reader/page.tsx`
- **Changes**:
  - Added "Clear Chat" button in chat dropdown menu (red text with trash icon)
  - Only shows when there's an active chat with messages
  - Clears messages and saves empty state to database
  - "New Chat" button creates a fresh chat session
- **Test Design**: Manual UI testing
- **Validation**: Build passes, all tests pass

### Fix: Batch Delete Papers Cascade

- **Scope**: `src/db/repositories/papers.repository.ts`, `src/main/services/papers.service.ts`, `src/renderer/components/papers-by-tag.tsx`
- **Changes**:
  - Fixed batch delete failure by wrapping deletes in a Prisma transaction
  - Prisma's `deleteMany` doesn't trigger application-level cascade deletes defined in schema
  - Now deletes ReadingNote, PaperTag, SourceEvent, and PaperCodeLink before Paper atomically
  - Added empty array guard clause
  - Added error logging in service layer
  - Improved frontend error message display to show actual error
- **Test Design**: Manual UI testing (batch delete in Electron app)
- **Validation**: Build passes, all tests pass

### Agentic Search: Error Feedback

- **Scope**: `src/renderer/components/search-content.tsx`
- **Changes**:
  - Added error state display when Agentic Search fails (e.g., no AI provider configured)
  - Shows red error card with message and link to Settings page
  - Removed silent fallback to normal search - user now sees why it failed
- **Test Design**: Manual UI testing
- **Validation**: TypeScript compiles

### Chat: AI Status Indicator & Notes Cleanup

- **Scope**: `src/renderer/pages/papers/reader/page.tsx`, `src/renderer/pages/papers/notes/page.tsx`
- **Changes**:
  - **Chat page**: Added AI status indicator showing current AI activity with gray spinner:
    - "正在提取PDF文本..." when extracting PDF text
    - "正在思考..." when waiting for AI response
  - Chat now extracts PDF text before sending to CLI for better context
  - **Notes page**: Removed "AI Fill" and "Summarize" buttons to simplify the interface
- **Test Design**: Manual UI testing
- **Validation**: Build passes

### Security: Remove Hardcoded API Keys from Tests

- **Scope**: `tests/integration/ai-provider.test.ts`, `tests/integration/reading.test.ts`, `.gitignore`
- **Changes**:
  - Removed all hardcoded API keys from test files
  - Tests now use environment variables only (`TEST_API_KEY`, `TEST_BASE_URL`, `TEST_LIGHTWEIGHT_MODEL`, `TEST_CHAT_MODEL`)
  - Added `.secrets`, `*.secret`, `.test-env` to `.gitignore` to prevent accidental commits
  - AI-related tests are automatically skipped if no API key is configured
- **Test Design**:
  - `ai-provider.test.ts`: Uses `maybeIt` to skip tests without API key
  - `reading.test.ts`: Added `aiEditNotes` test for AI chat functionality, skipped without API key
- **Validation**: All 21 tests pass (8 skipped - require API key)

### Test: AI Chat Dialogue (aiEditNotes)

- **Scope**: `tests/integration/reading.test.ts`
- **Changes**:
  - Added test for `ReadingService.aiEditNotes()` method
  - Test creates a paper with title/abstract and calls AI to generate reading notes
  - Verifies AI returns non-empty content for "Research Problem" and "Core Method" sections
- **Validation**: Test passes with API key configured (skipped otherwise)

### Library: Filter UI Improvements with Tag Modal

- **Scope**: `src/renderer/components/papers-by-tag.tsx`, `tailwind.config.ts`
- **Changes**:
  - Unified filter button styles: all use `rounded-lg px-2.5 py-1.5 text-sm font-medium`
  - Added section labels: "TIME", "YEAR", "TAG" in uppercase for better UX
  - Limited visible tags to 8, added "More" button for overflow
  - Added tag selection modal with fade-in and scale-in animations
  - Added `fade-in` and `scale-in` keyframes/animation to tailwind config
- **Test Design**: Manual UI verification
- **Validation**: Build passes

### PDF Text Extraction: pdf-parse v2 + Text Caching

- **Scope**: `src/main/services/pdf-extractor.service.ts`, `src/main/services/paper-text.service.ts`, `src/main/services/reading.service.ts`, `prisma/schema.prisma`, `src/db/repositories/papers.repository.ts`, `tests/integration/pdf-extractor.test.ts`, `tests/integration/ai-provider.test.ts`
- **Changes**:
  - Upgraded to `pdf-parse` v2 which uses a class-based API (`new PDFParse({ data: buffer }).getText()`)
  - Fixed pdf-parse dynamic import for ESM compatibility
  - Added HTTP request timeout (60s) for PDF downloads to prevent hanging
  - Added `textContent` and `textExtractedAt` fields to Paper model for caching extracted text
  - Created `paper-text.service.ts` to wrap PDF extraction with caching logic
  - Updated `reading.service.ts` to use cached paper text via `getPaperExcerptCached()`
  - Added `updateTextContent()` and `getTextContent()` methods to PapersRepository
  - Updated live PDF tests to be skipped by default (network-dependent), run with `RUN_LIVE_TESTS=1 npm test`
- **Test Design**:
  - `pdf-extractor.test.ts`: Unit tests for arxiv ID extraction, live tests skipped by default
  - `ai-provider.test.ts`: Tests for custom OpenAI-compatible API endpoint with model kind selection
- **Validation**: All 24 tests pass (4 skipped)

---

### Library: Batch Delete Papers

- **Scope**: `src/db/repositories/papers.repository.ts`, `src/main/services/papers.service.ts`, `src/main/ipc/papers.ipc.ts`, `src/renderer/hooks/use-ipc.ts`, `src/renderer/components/papers-by-tag.tsx`
- **Changes**:
  - Added `deleteMany(ids: string[])` method to PapersRepository using Prisma's `deleteMany`
  - Added batch delete service method in PapersService
  - Added `papers:deleteMany` IPC handler
  - Added `deletePapers()` IPC client method in use-ipc.ts
  - Added selection mode UI to PapersByTag component:
    - "Select" button to enter selection mode
    - Checkboxes on each paper card when in selection mode
    - Selection toolbar showing count, select all/deselect all, cancel, and delete buttons
    - Delete confirmation modal with framer-motion animations
    - ESC key support to close modal
  - Used AnimatePresence for smooth toolbar and modal transitions
- **Test Design**: Manual UI testing (batch delete through Electron app)
- **Validation**: Build passes, TypeScript compiles

## 2026-03-07

### Settings: UX Improvements & API Connection Test

- **Scope**: `src/renderer/pages/settings/page.tsx`, `src/renderer/components/model-combobox.tsx`, `src/main/store/model-config-store.ts`, `src/main/services/ai-provider.service.ts`, `src/main/ipc/models.ipc.ts`, `src/renderer/hooks/use-ipc.ts`
- **Changes**:
  - Removed "搜索模型或直接输入自定义ID" hint from model dropdown
  - Changed default API provider from Anthropic to OpenAI
  - Auto-activate first model when no active model exists for that kind
  - Added "Test Connection" button for API models (both in Add modal and saved cards) with real-time feedback
  - Test sends minimal request to verify API key and endpoint validity
  - Shows success/failure message after test
- **Test Design**: Manual UI testing in Electron app
- **Validation**: Build passes, type check passes, integration tests pass
- **Note**: Also restored UsageSettings component (token usage visualization) that was lost during git checkout, all tests pass

### Settings: Allow custom baseURL for all API providers

- Changed baseURL input visibility from `custom` provider only to all API providers
- Users can now set custom API endpoints for Anthropic, OpenAI, Gemini (e.g., for proxies)
- Placeholder text updated to indicate optional override

## 2026-03-07

### Fix: Database Connection Lost - DATABASE_URL Not Set Before Prisma Init

- **Scope**: `src/db/client.ts`
- **Changes**:
  - Fixed critical bug where PrismaClient was initialized before DATABASE_URL was set
  - In bundled code, DATABASE_URL was set at line 54175 but PrismaClient was created at line 33528
  - ES module static imports are hoisted, so environment variable setting in main/index.ts happened too late
  - Now `getPrismaClient()` sets DATABASE_URL directly using `getDbPath()` before creating PrismaClient
  - Papers now load correctly from `~/.vibe-research/vibe-research.db` (259 records verified)
- **Rationale**: ES module static imports execute before any runtime code; environment variables must be set synchronously at the point of use
- **Test Design**: Start app, verify papers load in Library
- **Validation**: TypeScript compiles, Prisma returns correct paper count

### Fix: Database Schema Out of Sync - Missing chatNoteId Column

- **Scope**: `~/.vibe-research/vibe-research.db`
- **Changes**:
  - Added missing `chatNoteId` column to ReadingNote table
  - Prisma schema had the field but database migration was not run
  - This caused `papers:list` to fail with "The column `main.ReadingNote.chatNoteId` does not exist"
  - `listTodayPapers` used raw query which didn't trigger the column check, so Dashboard worked
  - Library page uses `findMany` with relations which triggered schema validation
- **Rationale**: Schema drift between Prisma schema and actual database
- **Test Design**: Open Library page, verify papers load correctly
- **Validation**: Papers now display in Library

## 2026-03-07

### Feature: Real-time Tag Updates During Auto-tagging

- **Scope**: `src/renderer/components/papers-by-tag.tsx`
- **Changes**:
  - Tags now refresh every 2 papers during active tagging for "popping out" effect
  - Papers list refreshes every 5 papers to show untagged count decreasing in real-time
  - Added spring animation to tag pills for visual feedback when new tags appear
  - Modal tag pills also have staggered pop-in animation
- **Rationale**: Users want to see tags appearing in real-time as papers are being tagged, not just at the end
- **Test Design**: Run auto-tagging on multiple untagged papers, observe tags appearing with animation
- **Validation**: TypeScript compiles
