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
