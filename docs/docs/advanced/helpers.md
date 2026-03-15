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
import { toolWasCalled, when } from "@threaded/ai";

compose(
  model(),
  when(
    toolWasCalled("search_web"),
    tap((ctx) => console.log("model searched the web")),
  ),
);
```

Returns true if the specified tool was called in the model's last response.

## everyNMessages

Triggers a step every N messages.

```javascript
import { everyNMessages, model } from "@threaded/ai";

compose(
  everyNMessages(
    10,
    model({ system: "summarize the last 10 messages" }),
    tap(({ lastResponse }) => console.log("model's summarization:", lastResponse.content))
  ),
  model(),
);
```

Runs the summarization step every 10 messages.

## everyNTokens

Triggers a step based on token count.

```javascript
import { everyNTokens } from "@threaded/ai";

compose(
  everyNTokens(
    1_000_000,
    model({ system: "compress conversation history" }),
  ),
  model(),
);
```

Estimates tokens as length / 4.

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
  model,
  scope,
  when,
  tap,
  Inherit,
  noToolsCalled,
  everyNMessages,
  toolWasCalled,
} from "@threaded/ai";

const workflow = compose(
  everyNMessages(
    20,
    scope(
      {
        inherit: Inherit.Conversation,
        system: "create a brief summary of the conversation",
        silent: true,
      },
      model(),
    ),
  ),

  scope(
    {
      inherit: Inherit.All,
      tools: [search, calculator, weather],
      until: noToolsCalled(),
    },
    model(),
  ),

  when(
    toolWasCalled("search_web"),
    tap((ctx) => console.log("search was used")),
  ),
);
```

Helpers compose together for complex behaviors.
