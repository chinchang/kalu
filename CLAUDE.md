# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kalu is a browser-based calculator for fast, interlinked calculations. Users type expressions in a CodeMirror editor, results appear inline, and clicking a result inserts a reference (e.g., `_calc0`) that creates a live dependency between lines. It supports multi-page tabs, variable assignments, and unit conversions via math.js.

## Development

No build step, package manager, or test suite. This is a static site:

- **Run locally**: Open `index.html` directly in a browser, or use any static file server
- **No linting/testing/bundling** configured

## Architecture

All application logic lives in a single IIFE in `script.js` that exposes state on `window.kalu`. There is no module system.

### Key subsystems in `script.js`:

- **Pages management** (`kalu.pages`, `kalu.createPage`, `kalu.switchToPage`, `kalu.deletePage`): Multi-tab support where each page has independent content, calculations, and ID mappings. State is persisted to `localStorage` under `kalu_pages` and `kalu_current_page`.
- **Calculation engine** (`kalu.updateCalculations`): On every editor change (debounced 100ms), parses all lines, assigns/preserves unique IDs (`calc0`, `calc1`, ...), builds a dependency graph, evaluates expressions via `math.evaluate()`, and recursively updates dependents.
- **ID tracking system** (`idMapping`, `contentToId`, `lineHistory`): Preserves calculation IDs across edits so that references like `_calc0` remain valid when lines are added, removed, or reordered.
- **Reference highlighting** (`kalu.highlightReference`, `kalu.clearReferenceHighlights`): Uses CodeMirror `markText` to replace `_calcN` tokens with interactive spans that show tooltips and support click-to-jump.
- **UI rendering** (`kalu.updateUI`): Creates result widgets (yellow blocks) positioned at line ends via `cm.addWidget`. Clicking a widget inserts that line's reference at the cursor.

### Vendored libraries in `lib/`:

- **CodeMirror** (`lib/codemirror/`): Editor with monokai theme, JavaScript mode, close-brackets, and search-cursor addons
- **math.js** (`lib/math.min.js`): Expression parser/evaluator with unit conversion support

### File structure:

- `index.html` — Single HTML page with all styles inlined, loads libraries and `script.js`
- `script.js` — All application logic (~855 lines)
- `demo.txt` — Default demo content shown to new users (loaded if no localStorage data)
