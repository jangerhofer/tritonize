# Tritonizer Editor

A type-safe, local-first photo editor rebuilt around a worker-driven render engine.

## What is implemented

- Solid app shell with control panel, viewport, and linear undo/redo UI.
- Non-destructive operation graph (DAG model with hidden branching).
- Typed command/history system (`applyOperation`, `undo`, `redo`, `checkout`, `resetToRoot`).
- Worker render pipeline with WebGL2-first Tritonizer backend and Canvas2D fallback.
- Runtime boundary validation via `Schema` from `effect`.
- IndexedDB persistence with schema-versioned migration helpers.
- Export pipeline with capability detection and sequential export queue.

## Architecture

- `src/editor/types`: schemas, inferred domain types, decode helpers.
- `src/editor/domain`: immutable graph model and command system.
- `src/editor/engine`: protocol, orchestrator, worker client/entry, render backends.
- `src/editor/storage`: IndexedDB adapter, migrations, repository.
- `src/editor/export`: format capability detection and queue primitives.
- `src/editor/ui`: editor interface and interaction wiring.

## Commands

```bash
bun install
bun run dev
bun run typecheck
bun run test
bun run build
```

## Notes

- Persistence is local browser IndexedDB only.
- Branches are preserved in the model but not yet surfaced as a visual tree.
- AVIF/TIFF export support is capability-based and browser-dependent.
