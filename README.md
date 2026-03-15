# @threaded/ai

Composable LLM workflows for Node.js. Multi-provider support, tool execution, streaming, structured output, and approval workflows.

## Installation

```bash
npm install @threaded/ai
```

## Quick Example

```js
import { compose, scope, model, setKeys } from "@threaded/ai"

setKeys({ openai: process.env.OPENAI_API_KEY })

const searchTool = {
  name: "search",
  description: "Search the web",
  schema: { query: { type: "string", description: "Search query" } },
  execute: async ({ query }) => await searchWeb(query),
}

const workflow = compose(
  scope({ tools: [searchTool] }, model({ model: "openai/gpt-4o-mini" }))
)

const result = await workflow("find recent papers on WebSockets")
console.log(result.lastResponse.content)
```

## Providers

```js
model({ model: "openai/gpt-4o-mini" })
model({ model: "anthropic/claude-sonnet-4-5-20250929" })
model({ model: "google/gemini-2.0-flash" })
model({ model: "xai/grok-3" })
model({ model: "local/llama2" })       // Ollama
```

## Composition Primitives

| Function | Purpose |
|---|---|
| `compose(...steps)` | Chain steps into a pipeline |
| `scope(config, ...steps)` | Isolated context with tools, system prompt, inheritance |
| `model(config?)` | Call an LLM and auto-execute tool calls |
| `when(condition, step)` | Conditional execution |
| `tap(fn)` | Side effects without modifying context |
| `retry({ times }, step)` | Retry on failure |

## Features

- **Tools** with automatic execution, parallel calls, retry, and approval workflows
- **Structured output** via JSON Schema or Zod
- **Streaming** with real-time content and tool execution events
- **Threads** for persistent multi-turn conversations with pluggable storage
- **Scope inheritance** with bitwise flags (Conversation, Tools, All, Nothing)
- **Silent scopes** for background analysis without polluting history
- **Agentic loops** via `until` condition on scopes
- **Usage tracking** across nested scopes
- **Embeddings** via OpenAI or HuggingFace
- **Image generation** via OpenAI, Google, and xAI
- **MCP integration** for Model Context Protocol servers
- **Rate limiting** with token bucket algorithm

## Documentation

Full documentation is available at the [docs site](https://nvms.github.io/threaded), or browse the `docs/` directory.

## Examples

Working examples are in the `examples/` directory:

- `basic-chat/` - Express web app with streaming chat
- `code-agent/` - CLI coding agent with file tools
- `tool-approval/` - Web-based tool approval flow with SSE
- `image-gen/` - Multi-provider image generation

## License

ISC
