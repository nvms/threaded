# Threads

Persistent conversation storage that automatically manages message history.

Threads let you maintain stateful conversations across multiple exchanges. Each thread has an ID and a storage backend. When you send a message, the thread loads history, runs your workflow, then saves the updated history back to storage.

## Basic Usage

```typescript
import { getOrCreateThread } from "@threaded/ai";

const thread = getOrCreateThread("user-123");

await thread.message("hello, i'm building a todo app");
await thread.message("what should i name it?");
```

Here's what happens:

- `getOrCreateThread("user-123")` creates or retrieves a thread with ID "user-123"
- First `message()` call:
     - Loads history (empty on first call)
     - Adds your message to history
     - Calls `model()` with default settings (`openai/gpt-4o-mini` at time of writing)
     - Saves updated history (your message + model response)
- Second `message()` call:
     - Loads history (now contains previous exchange)
     - Adds new message to history
     - Calls model with full conversation context
     - Model remembers the previous conversation
     - Saves updated history

**Default model**: When you don't specify a workflow, `thread.message()` uses `model()` which defaults to `openai/gpt-4o-mini`.

## Specifying Which Model to Use

Pass a workflow with the model you want.

```typescript
import { getOrCreateThread, model } from "@threaded/ai";

const thread = getOrCreateThread("user-123");

await thread.message(
  "explain quantum entanglement",
  model({ model: "openai/gpt-4o" })
);
```

The model is used only for this message. The next call uses the default again unless you specify otherwise.

## Using the Same Model for All Messages

Create a reusable workflow.

```typescript
import { getOrCreateThread, model } from "@threaded/ai";

const thread = getOrCreateThread("user-123");
const gpt4 = model({ model: "openai/gpt-4o" });

await thread.message("first message", gpt4);
await thread.message("second message", gpt4);
await thread.message("third message", gpt4);
```

All three messages use GPT-4o.

## Different Models for Different Threads

```typescript
import { getOrCreateThread, model } from "@threaded/ai";

const fastThread = getOrCreateThread("quick-questions");
const smartThread = getOrCreateThread("complex-analysis");

const quick = model({ model: "openai/gpt-4o-mini" });
const smart = model({ model: "anthropic/claude-opus-4-20250514" });

await fastThread.message("what's 2+2?", quick);
await smartThread.message("analyze this research paper...", smart);
```

Each thread maintains separate history with different models.

## With Tools and System Prompts

Use compose and scope for complex workflows.

```typescript
import { getOrCreateThread, compose, model, scope } from "@threaded/ai";

const thread = getOrCreateThread("user-123");

const workflow = compose(
  scope(
    {
      system: "you are a helpful coding assistant",
      tools: [readFile, writeFile, searchWeb],
    },
    model({ model: "anthropic/claude-sonnet-4-5-20250929" }),
  ),
);

await thread.message("help me debug this function", workflow);
await thread.message("now add error handling", workflow);
```

The workflow includes a system prompt, tools, and model choice. The thread maintains history while the workflow defines behavior.

## In-Memory Storage

The default storage keeps messages in memory.

```typescript
const thread = getOrCreateThread("session-abc");

await thread.message("hello");
```

Conversations are lost when the process exits. Useful for:

- Development and testing
- Temporary sessions
- Stateless deployments where you don't need persistence

## Custom Storage

Implement two methods to persist conversations to any database.

```typescript
import { getOrCreateThread, model } from "@threaded/ai";
import Database from "better-sqlite3";

const db = new Database("threads.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    messages TEXT,
    updated_at INTEGER
  )
`);

const thread = getOrCreateThread("user-123", {
  async get(id) {
    const row = db.prepare("SELECT messages FROM threads WHERE id = ?").get(id);
    return row ? JSON.parse(row.messages) : [];
  },
  async set(id, messages) {
    db.prepare(
      "INSERT OR REPLACE INTO threads (id, messages, updated_at) VALUES (?, ?, ?)"
    ).run(id, JSON.stringify(messages), Date.now());
  },
});

await thread.message("hello");
```

Now conversations persist across restarts. Works with any storage:

**Postgres:**
```typescript
const thread = getOrCreateThread("user-123", {
  async get(id) {
    const result = await pool.query(
      "SELECT messages FROM threads WHERE id = $1",
      [id]
    );
    return result.rows[0]?.messages || [];
  },
  async set(id, messages) {
    await pool.query(
      "INSERT INTO threads (id, messages) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET messages = $2",
      [id, JSON.stringify(messages)]
    );
  },
});
```

**Redis:**
```typescript
const thread = getOrCreateThread("user-123", {
  async get(id) {
    const data = await redis.get(`thread:${id}`);
    return data ? JSON.parse(data) : [];
  },
  async set(id, messages) {
    await redis.set(`thread:${id}`, JSON.stringify(messages));
  },
});
```

## Thread Methods

### message

Adds a user message to history, runs the workflow, and saves the result.

```typescript
const result = await thread.message("what's the weather?", workflow);

console.log(result.lastResponse.content);
```

**Parameters:**

- `content` (string): User message to add to history.
- `workflow` (optional): Workflow to run. Defaults to `model()` with `openai/gpt-4o-mini`.

**Returns:** ConversationContext with full history and model response.

**When to use:** Normal user interactions where you want to add their message to history.

### generate

Runs a workflow without adding a user message.

```typescript
const result = await thread.generate(workflow);
```

**Parameters:**

- `workflow`: Workflow to run with the current history.

**Returns:** ConversationContext with updated history.

**When to use:**

- Autonomous agents that act without user input
- Scheduled tasks that analyze conversation history
- Background processing that updates thread state

**Example - scheduled summary:**
```typescript
import { getOrCreateThread, model } from "@threaded/ai";

const thread = getOrCreateThread("support-ticket-123");

setInterval(async () => {
  const history = await thread.store.get("support-ticket-123");

  if (history.length > 20) {
    await thread.generate(
      model({
        system: "summarize the conversation and add it to history as an assistant message",
      })
    );
  }
}, 60000);
```

The model generates a summary based on history without needing a user message.

## Accessing Thread History Directly

Read history without running a workflow.

```typescript
const thread = getOrCreateThread("user-123");

const history = await thread.store.get("user-123");
console.log(history);
```

Useful for displaying conversation history in a UI, analytics, etc.

## Real-World Pattern - Web App

Complete example with Express and persistent storage.

```typescript
import express from "express";
import { getOrCreateThread, compose, model, scope } from "@threaded/ai";
import Database from "better-sqlite3";

const app = express();
app.use(express.json());

const db = new Database("threads.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    messages TEXT,
    updated_at INTEGER
  )
`);

const createThread = (id) => getOrCreateThread(id, {
  async get(id) {
    const row = db.prepare("SELECT messages FROM threads WHERE id = ?").get(id);
    return row ? JSON.parse(row.messages) : [];
  },
  async set(id, messages) {
    db.prepare(
      "INSERT OR REPLACE INTO threads (id, messages, updated_at) VALUES (?, ?, ?)"
    ).run(id, JSON.stringify(messages), Date.now());
  },
});

const workflow = compose(
  scope(
    {
      system: "you are a helpful assistant",
      tools: [calculator, weather],
    },
    model({ model: "openai/gpt-4o" }),
  ),
);

app.post("/chat/:threadId", async (req, res) => {
  const thread = createThread(req.params.threadId);
  const result = await thread.message(req.body.message, workflow);

  res.json({
    response: result.lastResponse.content,
  });
});

app.get("/history/:threadId", async (req, res) => {
  const thread = createThread(req.params.threadId);
  const history = await thread.store.get(req.params.threadId);

  res.json({ history });
});

app.listen(3000);
```

Each user gets their own thread. History persists in SQLite. All messages use the same workflow with tools.

next: [composition](composition.md)
