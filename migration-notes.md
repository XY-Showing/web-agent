# Migration Notes — Phase 1 Full Fork

## Overview

- **Date:** 2026-04-13
- **SourceReference version:** 2.1.87
- **Files copied:** 1934 TypeScript/TSX source files
- **Directories:** 36 subdirectories under `src/`
- **bun install:** Succeeded, 564 packages installed
- **TypeScript version:** 6.0.2

## Compilation Status

`tsc --noEmit` reports **1434 errors**, all classified as B-type (SourceReference's own issues).

### Error Breakdown

| Category | Count |
|---|---|
| TS2307: Cannot find module | 534 |
| Other type errors (cascaded from missing modules) | 900 |

### Root Causes

#### 1. Private Anthropic packages (not publicly available)

These packages are imported in the source but are internal Anthropic packages unavailable on npm:

- `@ant/claude-for-chrome-mcp`
- `@ant/computer-use-input`
- `@ant/computer-use-mcp`
- `@ant/computer-use-mcp/sentinelApps`
- `@ant/computer-use-mcp/types`
- `@ant/computer-use-swift`

#### 2. Native NAPI addons (platform-specific, not included)

- `audio-capture-napi` — voice input capture
- `image-processor-napi` — image processing
- `url-handler-napi` — URL handling

#### 3. Internal files not present in SourceReference snapshot

The source map extraction from the npm binary did not include all internal files. The following modules are imported but never reconstructed:

- `src/types/message.ts` — core message type definitions
- `src/types/notebook.ts` — notebook type definitions
- `src/types/tools.ts` — tool type definitions
- `src/types/utils.ts` — utility type definitions
- `src/entrypoints/sdk/controlTypes.ts` — SDK control type definitions
- `src/services/oauth/types.ts` — OAuth type definitions
- `src/assistant/index.ts` — assistant module index
- `src/proactive/index.ts` — proactive suggestions module
- `src/coordinator/workerAgent.ts` — worker agent coordinator
- `src/bridge/peerSessions.ts` — bridge peer sessions
- `src/services/compact/reactiveCompact.ts` — reactive compaction
- `src/services/lsp/types.ts` — LSP types
- `src/services/skillSearch/*.ts` — skill search service files
- `src/tools/MonitorTool/MonitorTool.ts` — monitor tool
- `src/tools/WorkflowTool/WorkflowTool.ts` — workflow tool
- `src/tools/ReviewArtifactTool/ReviewArtifactTool.ts` — review artifact tool
- `src/tools/TerminalCaptureTool/prompt.ts` — terminal capture tool
- `src/tools/OverflowTestTool/OverflowTestTool.ts` — overflow test tool
- `src/tasks/MonitorMcpTask/MonitorMcpTask.ts` — monitor MCP task
- `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts` — local workflow task
- `src/skills/mcpSkills.ts` — MCP skills
- `src/utils/attributionHooks.ts` — attribution hooks
- And 160+ other internal module references

#### 4. tsconfig adjustment

Added `"ignoreDeprecations": "6.0"` to tsconfig.json to silence TypeScript 6.0's `baseUrl` deprecation warning. This is a C-type (configuration) fix, not a code change.

## Decision

Per the plan, B-type errors are recorded here but not fixed. The missing files are either:
1. Private packages that can't be open-sourced
2. Files missing from the SourceReference snapshot itself

Phase 1 is complete: all 1934 files from SourceReference/src have been copied to WebAgent/src with zero omissions. The compilation errors pre-exist in the source snapshot and do not represent regressions introduced during migration.

---

## Phase 2 Classification — 2026-04-13

### Summary

- **Total files:** 1934
- **Core directories:** 23
- **Extension directories:** 11
- **Mixed directories:** 2 (utils/, hooks/)
- **Root files classified:** 18 (13 core, 5 extension)
- **Violations found:** 539 (classified-core modules importing from extension)
- **Unique violating files:** 250
- **Dep graph completeness:** 1932/1934 files resolved, 189 warnings (missing private/internal modules)
- **Circular dependencies:** 1988 chains detected

### Dep Graph Stats (madge 8.0.0)

Most-imported modules (highest fan-in):
- `screens/REPL.tsx` — 232 dependents
- `main.tsx` — 181 dependents
- `cli/print.ts` — 133 dependents
- `components/PromptInput/PromptInput.tsx` — 116 dependents
- `commands.ts` — 105 dependents

### Key Findings from Violation Analysis

**539 violations** where directories classified as `core` import from `extension` directories.

Breakdown by source directory:
- `commands/`: 196 violations — many commands contain `.tsx` UI components alongside logic
- `tools/`: 120 violations — most from `UI.tsx` co-located files (e.g. `tools/BashTool/UI.tsx`)
- `utils/`: 91 violations — 73 files in utils/ import from extension dirs
- `hooks/`: 89 violations — 49 files in hooks/ import from extension dirs

**Implication:** `commands/` and `tools/` directories should be reclassified as `mixed` rather than `core` in a future revision. Many subdirectories follow a pattern of `CoreLogic.ts` + `UI.tsx` pairs.

### Mixed Directory Analysis

**utils/ (569 files):**
- 496 files (87%) are pure core — no extension imports
- 73 files (13%) import from extension directories and should be split out in Phase 3

**hooks/ (104 files):**
- 55 files (53%) are pure core
- 49 files (47%) import from extension directories
- The `hooks/` directory is heavily UI-coupled overall

### Next Steps (Phase 3, optional)

1. **Reclassify** `commands/` and `tools/` from `core` to `mixed` in module-classification.json
2. **Physical split**: Move confirmed extension files to `WebAgent/extensions/`
3. **Process mixed directories**: Per-file split for `utils/`, `hooks/`, `commands/`, `tools/`
4. **Handle violations**: Decide whether to adjust classification or refactor imports for core files like `QueryEngine.ts` and `Tool.ts` that import from extension
5. **Circular dependency cleanup**: 1988 circular chains require investigation before Phase 3 splitting
