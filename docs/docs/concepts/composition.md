# Composition

Combine workflow steps into complex behaviors using composable primitives.

## Compose

Chain steps together into a sequential pipeline.

```typescript
import { compose, model, tap } from "@threaded/ai";

const workflow = compose(
  tap((ctx) => console.log("before model call")),
  model(),
  tap((ctx) => console.log("after model call")),
);

await workflow("hello");
```

Each step receives conversation context and returns updated context.

## Model

Call an LLM.

```typescript
import { model } from "@threaded/ai";

const result = await model()("what is 2+2?");
```

### With Specific Model

```typescript
const result = await model({
  model: "openai/gpt-4o",
})("explain quantum physics");
```

Model format: `provider/model-name`

Supported providers:

- openai: `openai/<model-identifier>`
- anthropic: `anthropic/<model-identifier>`
- google: `google/<model-identifier>`

### With System Message

```typescript
const workflow = model({
  system: "you are a helpful coding assistant",
});

await workflow("help me write a function");
```

The system message gets prepended to conversation history.

### Dynamic System Message

```typescript
const workflow = model({
  system: (ctx) => `conversation has ${ctx.history.length} messages`,
});
```

The function receives context and returns a system message string.

## Scope

Create isolated execution contexts.

```typescript
import { compose, model, scope } from "@threaded/ai";

const workflow = compose(
  scope(
    {
      system: "you are a weather assistant",
      tools: [weatherTool],
    },
    model(),
  ),
);
```

Scope isolates tools, system messages, and streaming handlers.

### Inherit Flags

Control what gets passed into a scope.

```typescript
import { Inherit } from "@threaded/ai";

scope({ inherit: Inherit.Nothing }, model());
scope({ inherit: Inherit.Conversation }, model());
scope({ inherit: Inherit.Tools }, model());
scope({ inherit: Inherit.All }, model());
```

**Inherit.Nothing** - Empty context, no conversation history or tools.

Useful for sub-agents that don't need parent context.

```typescript
const subAgent = scope(
  {
    inherit: Inherit.Nothing,
    system: "you are a specialized validator",
    tools: [validateTool],
  },
  model(),
);
```

**Inherit.Conversation** - Includes conversation history (default).

**Inherit.Tools** - Includes tools from parent scope.

**Inherit.All** - Includes both conversation and tools.

### Until Condition

Run a scope repeatedly until a condition is met.

```typescript
import { noToolsCalled } from "@threaded/ai";

scope(
  {
    tools: [calculator],
    until: noToolsCalled(),
  },
  model(),
);
```

Keeps calling the model until no tools are called (agentic loop).

### Silent Mode

Run a scope without updating parent history.

```typescript
scope(
  {
    inherit: Inherit.All,
    silent: true,
  },
  model(),
);
```

Useful for validation or background tasks.

## When

Execute a step conditionally.

```typescript
import { when, model } from "@threaded/ai";

const workflow = compose(
  when(
    (ctx) => ctx.history.length > 10,
    model({ system: "summarize this conversation" }),
  ),
  model(),
);
```

Runs the step only if the condition returns true.

## Tap

Perform side effects without modifying context.

```typescript
import { tap } from "@threaded/ai";

const workflow = compose(
  tap((ctx) => {
    console.log(`history length: ${ctx.history.length}`);
  }),
  model(),
);
```

Useful for logging, metrics, and debugging.

## Retry

Retry failed steps.

```typescript
import { retry, model } from "@threaded/ai";

const workflow = compose(
  retry(
    { times: 3 },
    model(),
  ),
);
```

Retries up to 3 times on failure.

## Combining Everything

```typescript
import { compose, model, scope, when, tap, retry, Inherit, noToolsCalled } from "@threaded/ai";

const workflow = compose(
  tap((ctx) => console.log("starting workflow")),

  when(
    (ctx) => ctx.history.length > 20,
    scope(
      {
        inherit: Inherit.Conversation,
        system: "summarize the conversation so far",
        silent: true,
      },
      model(),
    ),
  ),

  scope(
    {
      inherit: Inherit.All,
      tools: [calculator, weather, search],
      until: noToolsCalled(),
    },
    retry(
      { times: 2 },
      model({ model: "openai/gpt-4o" }),
    ),
  ),
);
```

Composition lets you build complex agent behaviors from simple primitives.

next: [tools](tools.md)
