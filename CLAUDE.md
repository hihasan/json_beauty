# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Loading the Extension

No build step. Load directly in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder

After any code change, click **↺** (reload) on the extension card, then reopen the popup.

## Stack

Vanilla JS Chrome extension (Manifest v3). No framework, no bundler, no package.json. The only browser API used beyond the DOM is `chrome.storage.local` (requires the `"storage"` permission declared in `manifest.json`).

## Architecture

Three screens live in `popup.html` as sibling `div.screen` elements. Only one is visible at a time via the `.active` CSS class — `show(id)` in `popup.js` switches between them.

```
screen-input   → paste & title input, triggers Format
screen-viewer  → collapsible JSON tree + search bar
screen-history → filtered list of saved entries
```

All logic is in a single `popup.js`. Key sections, in file order:

| Section | What it does |
|---|---|
| Theme | `applyTheme` / `toggleTheme` / `loadTheme` via `chrome.storage.local` |
| DB | `dbLoad/Save/Add/Delete/Clear` — wraps `chrome.storage.local` in Promises; max 50 entries under key `jb_history` |
| `renderTree(value)` | Returns a DOM subtree for any JSON value. Inner `build()` recurses; `buildCollection()` handles objects/arrays with collapse toggles (`.jn-toggle`, `.jn-children.collapsed`). `makeEditable()` adds double-click inline editing to leaf spans. |
| Viewer Search | `viewerSearch` state object + `runViewerSearch / goToMatch / expandToMatch` — highlights `.jn-match` / `.jn-match-active` on matching `.jn-key/.jn-str/.jn-num/.jn-bool/.jn-null` spans; `expandToMatch` walks up the DOM uncollapsing any `.jn-children.collapsed` ancestors |
| `repairJSON(str)` | Two-pass fixer: strips bare newlines inside strings, then closes unclosed `{` / `[` brackets |
| History | `renderHistory()` filters by `historyFilter.{search,date}` and groups entries by relative date label |
| `openViewer(entry)` | Clears the viewer, resets search state, calls `renderTree`, switches screen |
| `autoTitle(parsed)` | Derives a label from well-known keys (`name`, `title`, `id`, …) or key list |

## DOM / CSS Conventions

- JSON token colours: `.jn-key` (purple/accent2), `.jn-str` (green), `.jn-num` (yellow), `.jn-bool` (orange), `.jn-null` (red)
- Collapsed subtrees: `.jn-children.collapsed { display:none }` + the toggle icon flips `▾`/`▸`
- All colour values are CSS custom properties on `:root`; light mode overrides them on `body.light`
- `btn-icon` buttons are 28 × 28 px, borderless icon buttons used throughout headers

## Adding a New Screen

1. Add `<div id="screen-foo" class="screen">` to `popup.html`
2. Call `show('screen-foo')` to navigate to it
3. Add a back button that calls `show('screen-input')` or the appropriate previous screen
