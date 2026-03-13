# ResearchClaw v0.0.2 Release Notes

## Overview

ResearchClaw is a standalone Electron desktop app for researchers to manage papers, track reading progress, and organize research ideas.

## What's New in v0.0.2

### Major Features

#### 1. Chat & Task System Separation

- **Chat History**: Chat conversations are now persisted independently with full history support
  - New database tables: `ChatSession` and `ChatMessage`
  - Chat sidebar for browsing and managing historical conversations
  - Auto-title generation for chat sessions based on first message
- **Task System**: Agent tasks are now completely separate from chat
  - Tasks are created manually from the Tasks tab only
  - Removed automatic task extraction from chat messages
  - Cleaner, more focused UX for both features

#### 2. Paper Comparison

- Compare multiple papers side-by-side with AI-generated analysis
- Auto-persist comparisons for later review
- Post-comparison chat for continued discussion
- Translation support (EN/中文 toggle)
- Notion-style typography for comparison output

#### 3. Literature Graph

- Citation extraction and visualization using Cytoscape
- Interactive graph exploration
- Node detail view with paper information
- Graph toolbar for navigation and filtering

#### 4. User Profile

- Personal research profile page
- AI-generated summary of research interests
- Reading statistics and paper collections overview

#### 5. Paper Collections

- Organize papers into collections/folders
- Nested collection folders support
- Library paper picker for adding to collections
- Collection-based paper management

#### 6. Semantic Search

- OpenAI-compatible embedding API support
- Offline-first vector search using sqlite-vec
- Automatic background citation extraction

#### 7. Hybrid Recommendations

- AI-powered paper recommendations from arXiv and Semantic Scholar
- More/less-like-this feedback for better recommendations
- Diversified recommendation clusters
- Recommendation exploration control

#### 8. SSH Remote Agent Execution

- Execute agent tasks on remote SSH servers
- Import SSH servers from `~/.ssh/config`
- Remote working directory picker
- Remote agent selector with server management

#### 9. First-Run Setup Wizard

- Guided initial configuration
- Model name and base URL setup
- Built-in model download with progress tracking
- Embedding model configuration

#### 10. Enhanced npx Resolution

- Fixed "spawn npx ENOENT" error when running agent tasks
- New `resolveNpxPath()` function finds npx from the active Node.js binary
- Better cross-platform support for different Node.js installations (Homebrew, nvm, volta, etc.)

### UI/UX Improvements

- **New App Icon**: Bird logo replacing the old design
- **Settings Consolidation**: Merged settings tabs for cleaner navigation
- **Import Enhancements**: Multi-file PDF upload with drag-and-drop support
- **Chat Improvements**: Better message rendering, code highlighting, copy functionality
- **PDF Viewer**: Improved stability and download handling
- **Auto-tagging**: Structured output with fallback for all providers
- **Token Usage Dashboard**: Track and visualize AI token consumption

### Technical Improvements

#### Database Schema

- Added `ChatSession` and `ChatMessage` models
- Added `Comparison` and `ComparisonItem` models
- Added `Citation` and `CitationEdge` for graph support
- Added `ChatSession` and `ChatMessage` models

#### Frontend Testing Infrastructure

- Added Vitest configuration for frontend component testing
- New test utilities: `tests/support/frontend-setup.ts`, `render-utils.tsx`, `chat-mock.ts`
- Component tests for TodoCard, TodoForm, IdeaChatModal, PriorityBar, StatusDot

#### Build & CI

- CI/CD release workflow for automated GitHub Releases
- macOS release builds for arm64
- Linux AppImage builds
- Pre-commit hooks for linting and testing

### Bug Fixes

- Fixed shell environment PATH resolution on macOS
- Improved command resolution for CLI tools (npx, node)
- Fixed chat stream race conditions during navigation
- Fixed PDF extraction stability in Electron main process
- Fixed sqlite-vec native library loading in packaged app
- Fixed agent chat UI tool call display and message persistence
- Fixed IPC handler race condition on app startup

## Downloads

### macOS (Apple Silicon)

- **DMG**: `ResearchClaw-0.0.2-arm64.dmg` (~145 MB)
- **ZIP**: `ResearchClaw-0.0.2-arm64-mac.zip` (~530 MB)

### Linux

- **AppImage**: Available via CI build

## Installation

### macOS

1. Download the DMG file
2. Open the DMG and drag ResearchClaw to Applications
3. On first launch, right-click and select "Open" to bypass Gatekeeper

### Linux

1. Download the AppImage
2. Make it executable: `chmod +x ResearchClaw-0.0.2.AppImage`
3. Run: `./ResearchClaw-0.0.2.AppImage`

## Known Issues

- macOS Intel (x64) builds temporarily unavailable due to electron-builder binary download issues
- Windows builds not yet available (coming in future release)

## Migration Notes

- Database schema has been updated - the app will auto-migrate on first launch
- Chat history from previous versions is not preserved (chat was ephemeral before)

## Feedback & Support

- GitHub Issues: [Report bugs or request features](https://github.com/Noietch/ResearchClaw/issues)

---

**Full Changelog**: https://github.com/Noietch/ResearchClaw/compare/67968d9e0fff2926211b2ab0e5ca873e4587fae2...v0.0.2
