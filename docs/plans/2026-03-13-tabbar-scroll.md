# Top Tab Bar Scroll Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the top tab bar stay usable when many tabs are open by enabling horizontal scrolling and keeping the active tab visible.

**Architecture:** Keep the existing tab state model in `use-tabs` unchanged and limit the behavior change to the title-bar layout in `AppShell`. Add a horizontally scrollable tab strip with a ref-driven `scrollIntoView` effect for the active tab, and cover the behavior with a focused frontend test that mocks the tab hook.

**Tech Stack:** React 19, React Router 7, Vitest, Testing Library, Tailwind CSS

---

### Task 1: Add a failing frontend test for tab-strip scrolling

**Files:**
- Create: `tests/frontend/components/AppShell.test.tsx`
- Reference: `src/renderer/components/app-shell.tsx`

**Step 1: Write the failing test**

Create a test that renders `AppShell` with a mocked `useTabs()` result containing several open tabs and one active tab. Assert that:
- the tab strip renders with horizontal overflow support
- the active tab triggers `scrollIntoView` when mounted

**Step 2: Run test to verify it fails**

Run: `npm run test:frontend -- tests/frontend/components/AppShell.test.tsx`

Expected: FAIL because the current tab strip does not expose horizontal scrolling and does not scroll the active tab into view.

### Task 2: Implement the minimal tab-strip fix

**Files:**
- Modify: `src/renderer/components/app-shell.tsx`

**Step 1: Add a scrollable tab-strip container**

Update the title bar layout so the tab region uses remaining horizontal space and can scroll with `overflow-x-auto` while keeping window controls fixed on the right.

**Step 2: Keep active tabs visible**

Track tab elements with refs and, on active tab changes, call `scrollIntoView({ block: 'nearest', inline: 'nearest' })` on the active tab.

**Step 3: Preserve existing tab appearance**

Retain the current width bounds (`minWidth: 80`, `maxWidth: 180`) and truncation so the change is behavioral, not a visual redesign.

### Task 3: Verify and document

**Files:**
- Modify: `changelog.md`

**Step 1: Run focused verification**

Run:
- `npm run test:frontend -- tests/frontend/components/AppShell.test.tsx`
- `npm run lint`

**Step 2: Update changelog**

Append a concise entry describing the tab-bar overflow/scroll fix and the affected UI scope.
