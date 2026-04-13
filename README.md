<div align="center">

# web-agent

**TypeScript library for building AI agent applications**

[![Version](https://img.shields.io/badge/version-1.0-blue?style=flat-square)](https://github.com/XY-Showing/web-agent)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.3.11-f9f1e1?style=flat-square&logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

Build your own ChatGPT interface, coding assistant, autonomous agent, or multi-agent system — without starting from scratch.

[What You Can Build](#what-you-can-build) · [Core Capabilities](#core-capabilities) · [Model Providers](#model-providers) · [Get Started](#install)

</div>

---

## What You Can Build

| | |
|---|---|
| **Chat interfaces** | Stream multi-turn conversations with tool use, exactly like ChatGPT or Claude.ai |
| **Coding assistants** | Agents that read, write, and edit files, run shell commands, search codebases |
| **Autonomous agents** | Long-running agents that take actions, make decisions, and loop until a goal is reached |
| **Multi-agent systems** | Orchestrate parallel sub-agents, delegate tasks, collect results |
| **MCP-powered apps** | Connect to any MCP server and expose its tools to your agent |
| **Custom tool platforms** | Define your own tools with typed schemas; the query engine handles the rest |

---

## Core Capabilities

### Query Engine

The agent loop that powers everything. Send a message, get back a result — the engine handles all the complexity in between.

```ts
import { QueryEngine } from './src/QueryEngine'
```

- Streams tokens from the LLM in real time
- Detects tool calls in the response and executes them automatically
- Feeds tool results back to the model and continues the loop
- Manages context window — compacts when approaching limits
- Supports multi-turn conversation history
- Works with all supported model providers transparently

---

### Tool System — 40+ built-in tools

Every tool has a typed Zod schema for input validation and a clean async handler. Extend `Tool` to define your own.

```ts
import { Tool } from './src/Tool'
```

**File & Code**

| Tool | Description |
|---|---|
| `FileReadTool` | Read files with line ranges |
| `FileEditTool` | Precise string replacement in files |
| `FileWriteTool` | Create or overwrite files |
| `GlobTool` | Find files by pattern (`**/*.ts`) |
| `GrepTool` | Search file contents with regex (ripgrep-backed) |
| `LSPTool` | Go-to-definition, find references via LSP |

**Execution**

| Tool | Description |
|---|---|
| `BashTool` | Run shell commands, capture stdout/stderr |
| `REPLTool` | Persistent REPL session across calls |

**Web**

| Tool | Description |
|---|---|
| `WebFetchTool` | Fetch any URL, returns clean text |
| `WebSearchTool` | Web search with structured results |

**Agent Orchestration**

| Tool | Description |
|---|---|
| `AgentTool` | Spawn a sub-agent with its own context and tools |
| `SendMessageTool` | Send messages to running agent instances |
| `TaskCreateTool` | Create background tasks |
| `TaskListTool` | List and monitor running tasks |
| `TaskOutputTool` | Stream output from a running task |
| `TaskStopTool` | Stop a task by ID |
| `RemoteTriggerTool` | Trigger remote agents or webhooks |
| `ScheduleCronTool` | Schedule recurring tasks |

**Infrastructure**

| Tool | Description |
|---|---|
| `MCPTool` | Call any tool exposed by an MCP server |
| `ToolSearchTool` | Search available tools by description |
| `SkillTool` | Invoke reusable skill prompts |
| `TodoWriteTool` | Write structured todo lists for progress tracking |
| `NotebookEditTool` | Edit Jupyter notebooks |

---

### Command System — 70+ slash commands

Pre-built slash command implementations covering memory, sessions, MCP servers, model switching, permissions, plans, and more. Wire them to your own UI or use them headlessly.

---

### Services

| Service | Description |
|---|---|
| `services/api` | API client with retry, streaming, multi-provider routing |
| `services/oauth` | OAuth flows for Anthropic and OpenAI |
| `services/mcp` | Full MCP client — connect, list tools, call tools |
| `services/lsp` | LSP client for code intelligence |
| `services/compact` | Context compaction — summarize history when context fills up |
| `services/SessionMemory` | Persist and restore conversation memory across sessions |
| `services/extractMemories` | Auto-extract key facts from conversations |
| `services/AgentSummary` | Summarize agent runs for audit and logging |
| `services/plugins` | Plugin lifecycle management |

---

### State, Skills & Plugins

- **State** — Centralized store for sessions, model config, permissions, and tool history. Built for React but usable headlessly.
- **Skills** — Reusable prompt templates that agents can invoke by name.
- **Plugins** — Extend the agent with new tools, commands, and behaviors at runtime.

---

## Model Providers

Switch providers via environment variables — no code changes needed.

| Provider | Env Variable | Auth |
|---|---|---|
| Anthropic (default) | — | `ANTHROPIC_API_KEY` or OAuth |
| AWS Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` | AWS credentials |
| Google Vertex AI | `CLAUDE_CODE_USE_VERTEX=1` | `gcloud` ADC |
| Anthropic Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | `ANTHROPIC_FOUNDRY_API_KEY` |
| OpenAI / compatible | `CLAUDE_CODE_USE_OPENAI=1` | `OPENAI_API_KEY` |

<details>
<summary>Supported models and environment variables</summary>

#### Anthropic

```bash
export ANTHROPIC_API_KEY="sk-..."
```

| Model | ID |
|---|---|
| Claude Opus 4.6 | `claude-opus-4-6` |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| Claude Haiku 4.5 | `claude-haiku-4-5` |

#### AWS Bedrock

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION="us-east-1"
```

#### Google Vertex AI

```bash
export CLAUDE_CODE_USE_VERTEX=1
# gcloud auth application-default login
```

#### Anthropic Foundry

```bash
export CLAUDE_CODE_USE_FOUNDRY=1
export ANTHROPIC_FOUNDRY_API_KEY="..."
```

#### OpenAI and Compatible Providers

```bash
# OpenAI
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-4o"          # optional, default: gpt-4o

# Moonshot / Kimi
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.moonshot.cn/v1"
export OPENAI_MODEL="moonshot-v1-8k"

# Qwen
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen-max"

# Ollama (local)
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY="ollama"
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_MODEL="llama3"
```

| Variable | Purpose |
|---|---|
| `CLAUDE_CODE_USE_OPENAI` | Enable OpenAI-compatible provider (set to `1`) |
| `OPENAI_API_KEY` | API key (use any string for local models) |
| `OPENAI_BASE_URL` | Endpoint base URL (default: `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | Model ID (default: `gpt-4o`) |

#### Environment Variables Reference

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_MODEL` | Override default model |
| `ANTHROPIC_BASE_URL` | Custom API endpoint |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Custom Opus model ID |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Custom Sonnet model ID |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Custom Haiku model ID |

</details>

---

## Install

```bash
git clone https://github.com/XY-Showing/web-agent
cd web-agent
bun install
```

**Requirements:** [Bun](https://bun.sh) >= 1.3.11

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
```

---

## Project Structure

```
src/
  QueryEngine.ts          # LLM query engine — message loop, tool dispatch, streaming
  Tool.ts                 # Tool base class and schema system
  Task.ts                 # Task definition and lifecycle

  tools/                  # 40+ built-in tool implementations
  commands/               # 70+ slash command implementations
  services/               # API, OAuth, MCP, LSP, compaction, memory, plugins
  state/                  # App state store
  hooks/                  # React hooks for UI integration
  skills/                 # Skill system
  plugins/                # Plugin system
  tasks/                  # Background task management
  utils/                  # Git, shell, permissions, settings, security, ...
  types/                  # TypeScript type definitions
  constants/              # Configuration constants
  schemas/                # Zod schemas
  migrations/             # State migrations
```

---

## Tech Stack

[![Bun](https://img.shields.io/badge/Runtime-Bun-f9f1e1?style=flat-square&logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Zod](https://img.shields.io/badge/Validation-Zod_v4-3E67B1?style=flat-square)](https://zod.dev)
[![MCP](https://img.shields.io/badge/Protocol-MCP-gray?style=flat-square)](https://modelcontextprotocol.io)

---

## Type Check

```bash
bun run tsc --noEmit
```

---

## License

MIT
