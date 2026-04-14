# Helpers

Utility functions for common patterns.

## noToolsCalled

Checks if the model called any tools.

```javascript
import { noToolsCalled } from "@threaded/ai";

scope(
  {
    tools: [calculator],
    until: noToolsCalled(),
  },
  model(),
);
```

Runs the model until no tools are called (agentic loop).

## toolWasCalled

Checks if a specific tool was called.

```javascript
import { compose, scope, model, when, tap, noToolsCalled, toolWasCalled, Inherit } from "@threaded/ai";

compose(
  scope(
    {
      inherit: Inherit.All,
      tools: [searchWeb],
      until: noToolsCalled(),
    },
    model(),
  ),

  when(
    toolWasCalled("search_web"),
    tap(async (ctx) => {
      const results = ctx.lastResponse.tool_calls
        .filter((c) => c.function.name === "search_web")
        .map((c) => JSON.parse(c.function.arguments));
      await db.insert("search_log", { thread: ctx.threadId, queries: results, ts: Date.now() });
    }),
  ),
);
```

Logs every search query the model makes to a database for analytics. Returns true if the specified tool was called in the model's last response.

## everyNMessages

Triggers a step every N messages.

```javascript
import { compose, scope, model, tap, everyNMessages, Inherit } from "@threaded/ai";
import { z } from "zod";

compose(
  everyNMessages(
    20,
    compose(
      scope(
        {
          inherit: Inherit.Conversation,
          system: "extract all action items, decisions, and open questions from this conversation as JSON",
          schema: z.object({
            actionItems: z.array(z.object({ owner: z.string(), task: z.string() })),
            decisions: z.array(z.string()),
            openQuestions: z.array(z.string()),
          }),
          silent: true,
        },
        model(),
      ),
      tap(async (ctx) => {
        await db.upsert("meeting_notes", ctx.threadId, JSON.parse(ctx.lastResponse.content));
      }),
    ),
  ),
  model(),
);
```

Every 20 messages, extracts structured meeting notes from the conversation and persists them to a database without interrupting the chat.

## everyNTokens

Triggers a step based on token count. Since every step receives a `ConversationContext` and returns a new one, you can replace `ctx.history` to compress the conversation.

```javascript
import { compose, scope, model, everyNTokens, Inherit } from "@threaded/ai";

compose(
  everyNTokens(
    1_000_000,
    compose(
      scope(
        {
          inherit: Inherit.Conversation,
          system: "summarize this entire conversation into a single, dense message. preserve all key facts, decisions, and context.",
          silent: true,
        },
        model(),
      ),
      async (ctx) => ({
        ...ctx,
        history: [
          { role: "assistant", content: ctx.lastResponse.content },
        ],
      }),
    ),
  ),
  model(),
);
```

The `scope` with `silent: true` runs the summarization without appending to the outer history. The next step replaces `ctx.history` with just the summary, compressing the entire conversation into a single message. Estimates tokens as length / 4.

## appendToLastRequest

Adds content to the last user message.

```javascript
import { appendToLastRequest } from "@threaded/ai";

compose(
  appendToLastRequest("\n\nplease remember to always be concise"),
  model(),
);
```

Modifies the last user message in history.

## toolNotUsedInNTurns

Triggers when a tool has not been used for N turns.

```javascript
import { toolNotUsedInNTurns, appendToLastRequest } from "@threaded/ai";

compose(
  toolNotUsedInNTurns(
    { toolName: "search_web", times: 5 },
    appendToLastRequest("\n\nconsider using the search_web tool if needed"),
  ),
  model(),
);
```

Reminds the model about available tools.

## Combining Helpers

```javascript
import {
  compose,
  scope,
  model,
  when,
  tap,
  Inherit,
  noToolsCalled,
  everyNMessages,
  toolWasCalled,
} from "@threaded/ai";
import { z } from "zod";

const supportAgent = compose(
  everyNMessages(
    10,
    compose(
      scope(
        {
          inherit: Inherit.Conversation,
          system: "extract ticket metadata from this conversation as JSON",
          schema: z.object({
            sentiment: z.enum(["positive", "neutral", "frustrated", "angry"]),
            topics: z.array(z.string()),
            resolved: z.boolean(),
          }),
          silent: true,
        },
        model(),
      ),
      tap(async (ctx) => {
        await db.upsert("tickets", ctx.threadId, JSON.parse(ctx.lastResponse.content));
      }),
    ),
  ),

  scope(
    {
      inherit: Inherit.All,
      tools: [orderLookup, knowledgeBase, escalateToHuman],
      until: noToolsCalled(),
    },
    model(),
  ),

  when(
    toolWasCalled("escalate_to_human"),
    tap(async (ctx) => {
      await slack.post("#support-escalations", {
        thread: ctx.threadId,
        summary: ctx.lastResponse.content,
      });
    }),
  ),
);
```

A customer support agent that periodically extracts ticket metadata to a database, uses tools in an agentic loop to look up orders and knowledge base articles, and posts to Slack when it escalates to a human.
