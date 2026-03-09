# Usage Guide

This guide explains how to use ResearchClaw — a standalone desktop app for AI-powered research management.

---

## Overview

ResearchClaw is organized around four core workflows:

| Workflow     | Where              | What it does                                  |
| :----------- | :----------------- | :-------------------------------------------- |
| **Import**   | Dashboard          | Bulk-import papers from Chrome history        |
| **Download** | Dashboard / Papers | Add a single paper by arXiv ID or URL         |
| **Read**     | Reader             | PDF + AI-generated notes side-by-side         |
| **Ideas**    | Ideas page         | Generate research directions from your corpus |

---

## Workflow 1: Import Papers

### From Chrome Browser History

**Step 1: Browse papers in Chrome**

Visit papers on arXiv.org in Chrome. The app will scan your local Chrome history file.

**Step 2: Click "Import from Chrome" on the Dashboard**

The app will:

1. Parse your Chrome history for arXiv URLs
2. Fetch paper metadata from the arXiv API
3. Add papers to your local database
4. Download PDFs for offline reading

Progress is shown in real-time on the Dashboard.

### Download a Single Paper

On the Dashboard or Papers page, click **Download** and enter an arXiv ID or URL:

```
2401.12345
https://arxiv.org/abs/2401.12345
```

---

## Workflow 2: AI-Assisted Reading

### Open the Reader

From the **Papers** page, click any paper to open the reader.

The reader shows:

| Panel     | Content                    |
| :-------- | :------------------------- |
| **Left**  | Rich-text notes (editable) |
| **Right** | PDF viewer                 |

### AI Note Generation

Click **"AI Fill"** to have the AI analyze the PDF and generate structured reading notes covering:

- Problem statement
- Core method
- Key results
- Limitations
- Personal takeaways

### Edit Modes

| Mode       | Behavior                                  |
| :--------- | :---------------------------------------- |
| **Vibe**   | View AI-generated notes (read-only)       |
| **Manual** | Edit notes freely; `Ctrl/Cmd + S` to save |

Click the **Vibe / Manual** toggle button to switch modes.

---

## Workflow 3: Generate Research Ideas

### Prerequisites

Import and read several papers first to build your corpus.

### Generate Ideas

Go to the **Ideas** page and click **"Generate Ideas"**.

The AI will analyze your paper library and produce:

- **Trend analysis** — emerging topics in your reading
- **Research directions** — potential areas to explore
- **Novel ideas** — combinations and extensions of existing work

Each idea includes a title, direction, hypothesis, validation path, priority, and novelty score.

---

## Workflow 4: Configure AI Providers

Go to **Settings → AI Providers** to configure which AI model powers the app.

### Supported Providers

| Provider      | Models                                               |
| :------------ | :--------------------------------------------------- |
| Anthropic     | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAI        | gpt-4o, gpt-4-turbo, gpt-3.5-turbo                   |
| Google Gemini | gemini-2.0-flash, gemini-1.5-pro                     |
| Custom        | Any OpenAI-compatible API                            |

### Setup

1. Select a provider
2. Enter your API key
3. (Optional) Set a custom base URL for proxies or local models
4. Click **Save**
5. Set as **Active** to use it for all AI features

---

## Workflow 5: CLI Tools

Go to **Settings → CLI Tools** to run AI CLI tools directly inside the app.

### Supported Tools

| Tool         | Command  | Notes                     |
| :----------- | :------- | :------------------------ |
| Claude Code  | `claude` | Requires separate install |
| OpenAI Codex | `codex`  | Requires separate install |
| Gemini CLI   | `gemini` | Requires separate install |

The app auto-detects installed tools and shows their version. Use the terminal panel to run commands and see streaming output.

---

## Tips & Shortcuts

| Action           | How                                      |
| :--------------- | :--------------------------------------- |
| Save notes       | `Ctrl/Cmd + S` in Manual mode            |
| Resize panels    | Drag the divider in the reader           |
| Copy paper ID    | Click the ID badge in the reader toolbar |
| Switch edit mode | Click "Vibe" / "Manual" button           |
| Delete a paper   | Papers page → hover → Delete button      |

---

## Support

- **Issues**: [GitHub Issues](https://github.com/Noietch/ResearchClaw/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Noietch/ResearchClaw/discussions)
