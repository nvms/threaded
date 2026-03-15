---
hide:
  - navigation
---

# Quick Start

## Installation

```bash
npm install @threaded/ai
```

## API Keys

Environment variables are detected automatically.

| Provider | Environment Variable |
|----------|---------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google | `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` |
| xAI | `XAI_API_KEY` |

You can also set them programmatically.

```typescript
import { setKeys } from "@threaded/ai";

setKeys({
  openai: "sk-...",
  anthropic: "sk-ant-...",
  google: "...",
  xai: "xai-...",
});
```

Or override per call, which is useful for multi-tenant apps.

```typescript
const ai = model({
  model: "openai/gpt-4.1-mini",
  apiKey: "sk-different-key",
});
```

## Basic Usage

A simple model call without conversation history.

```typescript
import { model } from "@threaded/ai";

const result = await model()("what is 2+2?");
console.log(result.lastResponse.content);
```

Select a provider with the `provider/model-name` format.

```typescript
import { model } from "@threaded/ai";

const openai = model({ model: "openai/gpt-4.1-mini" });
const anthropic = model({ model: "anthropic/claude-sonnet-4-20250514" });
const google = model({ model: "google/gemini-2.5-flash" });
const xai = model({ model: "xai/grok-3-mini" });

const result = await xai("what is 2+2?");
console.log(result.lastResponse.content);
```

## With Threads

Threads persist conversation history across messages.

```typescript
import { getOrCreateThread, model } from "@threaded/ai";

const thread = getOrCreateThread("user-123");

await thread.message("hello, i'm building a todo app");
await thread.message("what should i call it?");
```

The thread automatically manages history between calls, so the model remembers the previous conversation.

## With Tools

Give the model functions to execute.

```typescript
import { compose, model, scope } from "@threaded/ai";

const weather = {
  name: "get_weather",
  description: "Get weather for a city",
  schema: {
    city: { type: "string", description: "City name" },
  },
  execute: async ({ city }) => {
    return { city, temp: "72F", condition: "sunny" };
  },
};

const workflow = compose(
  scope(
    {
      tools: [weather],
    },
    model(),
  ),
);

const result = await workflow("what's the weather in san francisco?");
```

The model calls the tool automatically and uses the results in its response.

## Streaming

Stream content and tool execution updates in real time.

```typescript
const workflow = compose(
  scope(
    {
      tools: [weather],
      stream: (event) => {
        if (event.type === "content") {
          process.stdout.write(event.content);
        }
        if (event.type === "tool_executing") {
          console.log(`calling ${event.call.function.name}...`);
        }
      },
    },
    model(),
  ),
);

await workflow("what's the weather?");
```

Next: [Threads](concepts/threads.md)
