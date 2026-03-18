# @threaded/ai

Composable LLM inference with multi-provider support, tool execution, streaming, and approval workflows.

## Installation

```bash
npm install @threaded/ai
```

## Quick Start

```js
import { compose, scope, model, setKeys } from "@threaded/ai"

setKeys({ openai: process.env.OPENAI_API_KEY })

const result = await compose(model())("What is 2 + 2?")
console.log(result.lastResponse.content)
```

## Composition

Build workflows by composing steps. Each step receives a context and returns a new one.

```js
import { compose, scope, model, when, tap } from "@threaded/ai"
import { toolWasCalled } from "@threaded/ai"

const workflow = compose(
  scope({ tools: [searchTool], system: "you are a researcher" },
    model({ model: "openai/gpt-4o-mini" })
  ),
  when(toolWasCalled("search"),
    scope({ system: "summarize the findings" }, model())
  ),
  tap(ctx => console.log(ctx.lastResponse?.content))
)

const result = await workflow("find recent papers on WebSockets")
```

### Primitives

| Function | Purpose |
|---|---|
| `compose(...steps)` | Chain steps into a pipeline |
| `scope(config, ...steps)` | Isolated context with tools, system prompt, inheritance |
| `model(config?)` | Call an LLM and auto-execute tool calls |
| `when(condition, step)` | Conditional execution |
| `tap(fn)` | Side effects without modifying context |
| `retry({ times }, step)` | Retry a step on failure |

## Providers

Select a provider by prefixing the model name:

```js
model({ model: "openai/gpt-4o-mini" })
model({ model: "anthropic/claude-sonnet-4-5-20250929" })
model({ model: "google/gemini-2.0-flash" })
model({ model: "xai/grok-3" })
model({ model: "local/llama2" })
```

API keys are resolved in order: `config.apiKey` > `setKeys()` > environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)

## Tools

```js
const searchTool = {
  name: "search",
  description: "search the web",
  schema: {
    query: { type: "string", description: "search query" },
  },
  execute: async ({ query }) => {
    return await searchWeb(query)
  },
  _maxCalls: 5,
}

const result = await compose(
  scope({ tools: [searchTool] }, model())
)("search for WebSocket frameworks")
```

Tool calls are automatic - when the model returns tool calls, they're executed and the results fed back until the model responds with text.

## Structured Output

Pass a JSON schema or Zod schema:

```js
import { z } from "zod"

const result = await compose(
  model({
    model: "openai/gpt-4o-mini",
    schema: z.object({
      name: z.string(),
      age: z.number(),
    }),
  })
)("Extract: John is 30 years old")

JSON.parse(result.lastResponse.content)
// { name: "John", age: 30 }
```

## Streaming

```js
const result = await compose(
  scope({
    stream: (event) => {
      if (event.type === "content") process.stdout.write(event.content)
      if (event.type === "tool_executing") console.log("calling", event.call.function.name)
    },
  }, model())
)("explain WebSockets")
```

## Threads

Persistent multi-turn conversations:

```js
import { getOrCreateThread, compose, model } from "@threaded/ai"

const thread = getOrCreateThread("user-123")
await thread.message("hello", compose(model()))
await thread.message("what did I just say?", compose(model()))
```

Custom storage:

```js
const thread = getOrCreateThread("user-123", {
  get: async (id) => db.getMessages(id),
  set: async (id, messages) => db.setMessages(id, messages),
})
```

## Scope Inheritance

Control what inner steps see:

```js
import { Inherit } from "@threaded/ai"

// fresh context, no history
scope({ inherit: Inherit.Nothing }, model())

// carry history but not tools
scope({ inherit: Inherit.Conversation }, model())

// carry everything
scope({ inherit: Inherit.All }, model())

// silent - tools execute but history isn't modified
scope({ silent: true, tools: [analysisTool] }, model())

// loop until condition
scope({ until: noToolsCalled(), tools: [researchTool] }, model())
```

## Tool Approval

```js
const result = await compose(
  scope({
    tools: [deleteTool],
    toolConfig: {
      requireApproval: true,
      approvalCallback: (call) => confirm(`Allow ${call.function.name}?`),
    },
  }, model())
)("delete all inactive users")
```

## Embeddings

```js
import { embed } from "@threaded/ai"

const vector = await embed("openai/text-embedding-3-small", "hello world")
const vectors = await embed("openai/text-embedding-3-small", ["hello", "world"])
```

## Image Generation

```js
import { generateImage } from "@threaded/ai"

const image = await generateImage("openai/dall-e-3", "a cat in space", {
  size: "1024x1024",
  quality: "hd",
})
```

## MCP Integration

```js
import { createMCPTools } from "@threaded/ai"

const mcpTools = await createMCPTools(mcpClient)
const result = await compose(
  scope({ tools: mcpTools }, model())
)("use the available tools")
```

## Helpers

```js
import { noToolsCalled, toolWasCalled, everyNMessages, appendToLastRequest } from "@threaded/ai"

// loop until model stops calling tools
scope({ until: noToolsCalled(), tools: [...] }, model())

// conditional on tool usage
when(toolWasCalled("search"), summarizeStep)

// periodic actions
everyNMessages(10, appendToLastRequest("stay concise"))
```

## Usage Tracking

```js
const result = await workflow("prompt")
console.log(result.usage)
// { promptTokens: 150, completionTokens: 42, totalTokens: 192 }
```

Usage accumulates through nested scopes automatically.

## License

ISC
