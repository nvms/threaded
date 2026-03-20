# Tools

Give models functions they can execute during a conversation.

## Basic Tool Definition

```typescript
const calculator = {
  name: "calculate",
  description: "Perform basic math operations",
  schema: {
    operation: {
      type: "string",
      description: "The operation to perform",
      enum: ["add", "subtract", "multiply", "divide"],
    },
    a: {
      type: "number",
      description: "First number",
    },
    b: {
      type: "number",
      description: "Second number",
    },
  },
  execute: async ({ operation, a, b }) => {
    switch (operation) {
      case "add": return a + b;
      case "subtract": return a - b;
      case "multiply": return a * b;
      case "divide": return a / b;
      default: return "invalid operation";
    }
  },
};
```

The schema defines parameters and the execute function runs the logic.

## Using Tools

```typescript
import { compose, model, scope } from "@threaded/ai";

const workflow = compose(
  scope(
    {
      tools: [calculator],
    },
    model(),
  ),
);

const result = await workflow("what is 15 * 23?");
```

The model calls the tool automatically when needed.

## Zod Schemas

Use Zod for type-safe tool schemas.

```typescript
import { z } from "zod";

const weather = {
  name: "get_weather",
  description: "Get weather for a city",
  schema: z.object({
    city: z.string().describe("City name"),
    units: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  execute: async ({ city, units = "celsius" }) => {
    return { city, temp: 22, units };
  },
};
```

The library converts Zod schemas automatically.

## Tool Limits

Limit how many times a tool can be called to prevent infinite loops or excessive API usage.

### Permanent Limit on Tool Definition

Add `_maxCalls` directly to the tool.

```typescript
const search = {
  name: "web_search",
  description: "Search the web",
  schema: {
    query: { type: "string", description: "Search query" },
  },
  execute: async ({ query }) => {
    return await fetch(`https://api.search.com?q=${query}`);
  },
  _maxCalls: 3,
};
```

This tool object will use a limit of 3 calls whenever it's added to a scope. If you pass this tool object to multiple workflows, they all use the same limit (3 calls per workflow execution).

### Dynamic Limit per Workflow

Use `maxCalls()` to set different limits for different workflows.

```typescript
import { maxCalls, compose, model, scope } from "@threaded/ai";

const search = {
  name: "web_search",
  description: "Search the web",
  schema: {
    query: { type: "string", description: "Search query" },
  },
  execute: async ({ query }) => {
    return await fetch(`https://api.search.com?q=${query}`);
  },
};

const limitedWorkflow = compose(
  scope(
    {
      tools: [maxCalls(search, 2)],
    },
    model(),
  ),
);

const generousWorkflow = compose(
  scope(
    {
      tools: [maxCalls(search, 10)],
    },
    model(),
  ),
);
```

`maxCalls()` wraps the tool and adds a limit for that specific workflow. Useful when different contexts need different limits.

**When to use each:**

- `_maxCalls` on tool definition: Sets a default limit on the tool object. All scopes using this tool object see the same limit.
- `maxCalls()` wrapper: Creates a new tool object with a different limit. Lets you use the same base tool with different limits in different workflows.

## Parallel Execution

Execute multiple tool calls at once.

```typescript
scope(
  {
    tools: [weather, calculator, search],
    toolConfig: {
      parallel: true,
    },
  },
  model(),
);
```

The default is sequential execution.

## Tool Retry

Retry failed tool calls.

```typescript
scope(
  {
    tools: [unreliableApi],
    toolConfig: {
      retryCount: 2,
    },
  },
  model(),
);
```

Retries tool execution up to 2 times on failure.

## Streaming Tool Events

Stream callbacks let you react to tool execution in real-time. Useful for showing progress in UIs or logging tool usage.

### Web App Streaming

```typescript
import express from "express";
import { getOrCreateThread, compose, model, scope } from "@threaded/ai";

const app = express();
app.use(express.json());

const weatherTool = {
  name: "get_weather",
  description: "Get weather for a city",
  schema: {
    city: { type: "string", description: "City name" },
  },
  execute: async ({ city }) => {
    const response = await fetch(`https://wttr.in/${city}?format=j1`);
    const data = await response.json();
    return {
      city,
      temp: data.current_condition[0].temp_C,
      condition: data.current_condition[0].weatherDesc[0].value,
    };
  },
};

app.post("/chat/:threadId", async (req, res) => {
  const { threadId } = req.params;
  const { message } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const thread = getOrCreateThread(threadId);

  const workflow = compose(
    scope(
      {
        tools: [weatherTool],
        toolConfig: {
          parallel: true,
        },
        stream: (event) => {
          switch (event.type) {
            case "content":
              res.write(`data: ${JSON.stringify({ type: "content", content: event.content })}\n\n`);
              break;
            case "tool_calls_ready":
              res.write(`data: ${JSON.stringify({ type: "tool_calls_ready", calls: event.calls.map(c => c.function.name) })}\n\n`);
              break;
            case "tool_executing":
              res.write(`data: ${JSON.stringify({ type: "tool_executing", name: event.call.function.name, args: JSON.parse(event.call.function.arguments) })}\n\n`);
              break;
            case "tool_complete":
              res.write(`data: ${JSON.stringify({ type: "tool_complete", name: event.call.function.name, result: event.result })}\n\n`);
              break;
            case "tool_error":
              res.write(`data: ${JSON.stringify({ type: "tool_error", name: event.call.function.name, error: event.error })}\n\n`);
              break;
          }
        },
      },
      model(),
    ),
  );

  await thread.message(message, workflow);
  res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
  res.end();
});

app.listen(3000);
```

The stream callback receives events during model execution and sends them to the client via SSE.

```typescript
const chatForm = document.getElementById("chat-form");
const messagesDiv = document.getElementById("messages");
const toolStatusDiv = document.getElementById("tool-status");

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = e.target.message.value;

  const response = await fetch("/chat/user-123", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n\n");

    for (const line of lines) {
      if (!line.trim() || !line.startsWith("data: ")) continue;

      const data = JSON.parse(line.replace("data: ", ""));

      if (data.type === "content") {
        messagesDiv.textContent += data.content;
      }

      if (data.type === "tool_calls_ready") {
        toolStatusDiv.textContent = `calling: ${data.calls.join(", ")}`;
      }

      if (data.type === "tool_executing") {
        toolStatusDiv.textContent = `executing ${data.name}...`;
      }

      if (data.type === "tool_complete") {
        console.log(`${data.name} result:`, data.result);
        toolStatusDiv.textContent = "";
      }

      if (data.type === "tool_error") {
        toolStatusDiv.textContent = `error: ${data.error}`;
      }

      if (data.type === "complete") {
        toolStatusDiv.textContent = "";
      }
    }
  }
});
```

The client listens to the SSE stream and updates the UI based on event types.

### CLI Streaming

```typescript
import { compose, model, scope } from "@threaded/ai";

const workflow = compose(
  scope(
    {
      tools: [calculator, weather, search],
      stream: (event) => {
        switch (event.type) {
          case "content":
            process.stdout.write(event.content);
            break;
          case "tool_calls_ready":
            console.log(`\n[tools queued: ${event.calls.map(c => c.function.name).join(", ")}]`);
            break;
          case "tool_executing":
            console.log(`[executing: ${event.call.function.name}]`);
            break;
          case "tool_complete":
            console.log(`[${event.call.function.name} complete]`);
            break;
          case "tool_error":
            console.log(`[${event.call.function.name} failed: ${event.error}]`);
            break;
        }
      },
    },
    model(),
  ),
);

await workflow("what's the weather in tokyo and what's 15 * 23?");
```

Shows tool execution progress in the terminal.

## Tool Approval with Streaming

When building interactive applications, you often want user approval before executing tools. Streaming and approval work together - stream events let the UI show what tools are being called, then approval lets users decide whether to allow them.

See [tool approval](https://nvms.github.io/threaded-ai/advanced/approval/index.md) for the full frontend/backend approval flow with SSE.
