# Scripting Space Scribble

A **plug-and-play dashboard** for reading and editing scribbles. Drop a `.txt`
file **anywhere on the screen** and it opens in a code editor (CodeMirror 6),
ready to edit. The dashboard is built around a **plugin architecture**: every
capability (like the text file reader/editor) is a self-contained feature
plugin that "plugs in" to the dashboard shell without the shell knowing
anything about it.

## Quick Start

```bash
yarn              # from repo root (workspace: distribution/*)
yarn workspace @scripting-space/scribble dev        # run the Vite dev server
yarn workspace @scripting-space/scribble test       # run vitest
yarn workspace @scripting-space/scribble typecheck  # tsc --noEmit
yarn workspace @scripting-space/scribble build     # production build → dist/
```

Then drag & drop a `.txt` file **anywhere on the page** — a "Drop to open a
file" overlay appears and the file opens in the editor. You can also click the
drop zone in the **Text File Reader** panel (or press Enter on it) to browse.

## Architecture

```
src/
├── main.tsx                  # Vite entry — mounts <ScribbleDashboard />
├── app.css                   # Global viewport lock: 100vh × 100vw, zero body margin, no window scrollbar
├── vite-env.d.ts             # Vite client types (CSS import declarations for tsc)
├── index.ts                  # Library barrel (components, dashboards, features, functions)
│
├── dashboards/               # The dashboard shell
│   └── ScribbleDashboard.tsx #   Global drop handling + header + one panel per registered plugin
│
├── features/                 # PLUGINS — each folder is a self-contained feature
│   ├── textReader/           #   Drop/browse .txt → opens in the code editor
│   └── index.ts              #   Importing this barrel plugs all features in
│
├── components/               # Shared React components available to ALL features
│   ├── CodeEditor.tsx        #   CodeMirror 6 editor wrapper (@uiw/react-codemirror, dark theme)
│   ├── FileDropZone.tsx      #   Prop-driven drop zone (drag, click, keyboard)
│   ├── PlainTextOutput.tsx   #   Verbatim plain-text output panel
│   └── PluginPanel.tsx       #   Modular card wrapper (title + description + slot)
│
└── functions/                # Plugin infrastructure (no React rendering)
    ├── pluginTypes.ts        #   ScribblePlugin type contract
    ├── pluginRegistry.ts     #   Module-level registry (register / remove / list)
    ├── fileStore.ts          #   Shared "open file" session context (localContextStore)
    └── readTextFile.ts       #   FileReader → Promise<ScribbleFile>
```

### The Plugin Contract (`src/functions/pluginTypes.ts`)

Every feature is a `ScribblePlugin`:

```ts
type ScribblePlugin = {
    id: string;          // stable unique id — re-registering replaces (hot-swap)
    title: string;       // panel header title
    description: string; // panel description line
    Component: FC;       // self-owned component; the dashboard passes no props
};
```

### How Plug-and-Play Works

1. A feature calls `registerScribblePlugin({ id, title, description, Component })`
   **at module scope** (see `src/features/textReader/TextReaderFeature.tsx`,
   bottom of file).
2. The feature is added to `src/features/index.ts` — one line.
3. `ScribbleDashboard` imports the features barrel (side-effect import) and
   renders `getScribblePlugins()` — one panel per plugin, in registration order.

The dashboard never imports a feature directly and never passes props into it.
Features own their internal state (via `useStateHook` / `useReferenceHook` from
`@presource/react`).

### The Shared File Session (`src/functions/fileStore.ts`)

Global drop-to-open is a dashboard capability, not a plugin capability — any
file dropped anywhere on screen goes through the same session:

1. `ScribbleDashboard` owns the open-file state (`ScribbleFile = { name, content }`)
   and injects `openFile` / `updateContent` / `closeFile` into the
   `ScribbleFileProvider` context (built on `localContextStore`).
2. The dashboard root element (`100% × 100%`, `overflow: hidden`) handles
   `onDrop` / `onDragOver` / `onDragLeave` globally, reads the file via
   `readTextFile()` (a `FileReader` → `Promise<ScribbleFile>` helper) and opens
   it in the session. The page is a fixed three-area layout — **header /
   content / footer** — and a **dashed drop outline covers the content area**
   (inset 12px, absolutely positioned inside it) but **only while no file is
   open**; once files are open the tab strip takes over (dropping more files
   still works anywhere on the page).
3. Any plugin reads the session with `const store = scribbleFileStore()` and
   renders accordingly. The text-reader plugin renders **one tab per open
   file** plus a full-area `CodeEditor` for the active tab — or nothing when
   no file is open (files enter by dropping only; there are no browse
   buttons).

Edits are a controlled loop: `CodeMirror` fires `onChange` →
`store.updateContent(content)` → the provider context updates → the editor
re-renders with the new content.

### Adding a New Plugin

```
src/features/myFeature/
├── MyFeature.tsx     # component + registerScribblePlugin({ id: 'my-feature', ... })
└── index.ts          # export * from './MyFeature';
```

```ts
// src/features/index.ts
export * from './textReader';
export * from './myFeature';   // ← one line to plug in
```

## Components Catalog

Shared, self-contained components any feature can compose (all styled with
`styledComponent` from `@presource/react` — no inline styles):

| Component | Props | Purpose |
|---|---|---|
| `CodeEditor` | `value`, `onChange`, `testId?` | Controlled CodeMirror 6 editor (via `@uiw/react-codemirror`, dark theme, 320px). Line numbers, bracket matching, undo history out of the box. Test id: `code-editor` / custom. |
| `FileDropZone` | `dragOver`, `title`, `hint`, `onClick`, `onDrop`, `onDragOver`, `onDragLeave` | Local drag & drop shell with `role="button"` + Enter/Space keyboard activation. Available for plugins that scope drops to a region (the dashboard's global viewport-wide outline covers the drop-anywhere case). |
| `PlainTextOutput` | `text` | Verbatim plain-text rendering (`pre-wrap`, monospace, scrollable). Test id: `plain-text-output`. |
| `PluginPanel` | `title`, `description?`, `children` | The modular card the dashboard wraps every plugin in. `description` is optional — omit for plugins that need no explanation. Test id: `plugin-panel`. |

## Current Behavior

- **Global drop, per-file tabs.** The page is a fixed header / content /
  footer layout; a dashed outline (inset 12px) covers the content area **only
  while no file is open** — a `.txt` file dropped anywhere on the page opens
  in its own tab, and further drops add more tabs. While dragging (with no
  files open) the outline intensifies with a scrim + label.
- **Tabs.** Every dropped file gets its own tab (tab strip above the editor).
  **Multi-file drops load every file** (not just the first), each in its own
  tab in drop order — the last file of the drop becomes the active tab. Click
  a tab to switch; the × on a tab closes it (closing the active tab falls
  back to the most recent remaining one). Re-dropping a file whose name
  matches an open tab replaces that tab's content instead of duplicating it.
- **Editable.** The active file renders in a CodeMirror 6 editor — line
  numbers, undo/redo history, bracket matching. Edits update the shared file
  session live (in memory only — no persistence yet).
- **Drop-only entry.** There are no browse buttons or click-to-open paths —
  dropping a file on the page is the only way in.
- **No panel chrome.** Plugin surfaces render directly in the content area
  (no "Text File Reader" card) — the tab strip + editor fill the region when
  files are open; the area shows only the dashed outline when not.
- **Editable.** Opened files render in a CodeMirror 6 editor — line numbers,
  undo/redo history, bracket matching. Edits update the shared file session
  live (in memory only — no persistence yet).
- **Read only parsing, no patterns yet.** Content is read and rendered
  verbatim; pattern extraction is a planned plugin capability.
- The file name is shown above the editor with a **Close** button that returns
  to the empty drop state. Dropping a second file replaces the session.
- The hidden file input accepts `.txt`, `.text`, and `text/plain`.

### Why CodeMirror 6 (and not Monaco)?

Two solid npm options exist for embeddable code editing:

- **CodeMirror 6** (chosen) — modular, lightweight (~150 KB gzip for a basic
  setup), excellent programmatic API, first-class React wrapper
  [`@uiw/react-codemirror`](https://uiwjs.github.io/react-codemirror/).
- **Monaco Editor** (VS Code's editor) — much heavier (~2 MB+), needs web
  worker wiring with Vite; overkill for a plain-text scribble editor.

If syntax highlighting per language is needed later, add the matching
`@codemirror/lang-*` package (e.g. `@codemirror/lang-markdown`) to the
`CodeEditor` component's `extensions` prop.

## Roadmap

- **Pattern extraction plugins** — read the text for patterns (headings, lists,
  delimiters, custom scribble syntax) and generate a layout from them.
- **Layout generation** — turn parsed patterns into responsive dashboard grids.
- **Multiple file drop** — one panel per dropped file.
- **GitHub Pages deploy** — `vite.config.ts` already uses `base: './'`; see the
  TODO in the package root `index.ts`.

## Testing

Tests live next to their sources (`*.test.tsx` / `*.test.ts`), run with Vitest +
jsdom + React Testing Library:

- `src/functions/pluginRegistry.test.ts` — registry order, idempotent re-register, removal
- `src/functions/fileStore.test.tsx` — `readTextFile` results (name + verbatim content), file session open/close through the provider
- `src/features/textReader/TextReaderFeature.test.tsx` — drop simulation (`fireEvent.drop` + `File`), editor opens with content, controlled-edit loop via the shared store, close/reopen, plugin registration
- `src/dashboards/ScribbleDashboard.test.tsx` — header, one panel per plugin, **global drop anywhere on the root**, drop overlay show/hide, plugin component rendered inside its panel

CodeMirror needs DOM APIs jsdom lacks (`ResizeObserver`, layout rects) —
`vitest.setup.ts` polyfills them, so the real editor mounts in tests.
