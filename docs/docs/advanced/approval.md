# Tool Approval

Require user approval before executing tools.

Tool approval lets you intercept tool calls before execution and decide whether to allow or deny them. This is useful for dangerous operations or interactive agents.

## Web App Approval (SSE)

This is how you build interactive approval for web apps. The server sends approval requests to the frontend via SSE, and the frontend sends the approval decision back via POST.

=== "Backend (server.js)"

    ```javascript
    import express from "express";
    import { getOrCreateThread, compose, model, scope } from "@threaded/ai";

    const app = express();
    app.use(express.json());

    const pendingApprovals = new Map();

    const weatherTool = {
      name: "get_weather",
      description: "Get weather for a city",
      schema: {
        city: { type: "string", description: "City name" },
      },
      execute: async ({ city }) => {
        return { city, temp: "72°F", condition: "sunny" };
      },
    };

    app.post("/chat/:threadId", async (req, res) => {
      const { threadId } = req.params;
      const { message } = req.body;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const thread = getOrCreateThread(threadId);

      const approvalCallback = async (toolCall) => {
        return new Promise((resolve) => {
          const approvalId = `${threadId}-${toolCall.id}`;
          pendingApprovals.set(approvalId, resolve);

          res.write(
            `data: ${JSON.stringify({
              type: "tool_approval_required",
              toolName: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments),
              approvalId,
            })}\n\n`
          );
        });
      };

      const send = (type, data) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      };

      const workflow = compose(
        scope(
          {
            tools: [weatherTool],
            toolConfig: {
              requireApproval: true,
              approvalCallback,
            },
            stream: (event) => {
              switch (event.type) {
                case "content":
                  send("content", { content: event.content });
                  break;
                case "tool_calls_ready":
                  send("tool_calls", { calls: event.calls.map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })) });
                  break;
                case "tool_executing":
                  send("tool_executing", { id: event.call.id, name: event.call.function.name });
                  break;
                case "tool_complete":
                  send("tool_complete", { id: event.call.id, name: event.call.function.name, result: event.result });
                  break;
                case "tool_error":
                  send("tool_error", { id: event.call.id, name: event.call.function.name, error: event.error });
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

    app.post("/approve/:approvalId", (req, res) => {
      const { approvalId } = req.params;
      const { approved } = req.body;

      const resolve = pendingApprovals.get(approvalId);
      if (!resolve) {
        return res.status(404).json({ error: "approval not found" });
      }

      pendingApprovals.delete(approvalId);
      resolve(approved);

      res.json({ success: true });
    });

    app.listen(3000);
    ```

    The approvalCallback creates a promise that waits for a client response. When the client posts to `/approve/:approvalId`, the promise resolves and tool execution continues.

=== "Frontend (client.js)"

    ```javascript
    const output = document.getElementById("output");
    const pendingApprovals = [];

    function handleEvent(type, data) {
      switch (type) {
        case "content":
          output.textContent += data.content;
          break;
        case "tool_calls":
          for (const call of data.calls) {
            console.log(`tool requested: ${call.name}`);
          }
          break;
        case "tool_approval_required":
          pendingApprovals.push(data);
          showApprovalDialog(data);
          break;
        case "tool_executing":
          console.log(`executing ${data.name}...`);
          break;
        case "tool_complete":
          console.log(`${data.name} result:`, data.result);
          break;
        case "tool_error":
          console.log(`${data.name} failed:`, data.error);
          break;
        case "complete":
          break;
      }
    }

    async function showApprovalDialog({ toolName, approvalId, arguments: args }) {
      const approved = confirm(
        `Allow ${toolName}?\nArguments: ${JSON.stringify(args, null, 2)}`
      );

      await fetch(`/approve/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
    }

    async function chat(threadId, message) {
      const res = await fetch(`/chat/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          handleEvent(data.type, data);
        }
      }
    }

    chat("user-123", "what's the weather in NYC?");
    ```

    The client handles the full event lifecycle - content streaming, tool status tracking, and approval flows. When the server sends a `tool_approval_required` event, the client shows a confirmation dialog and posts the decision back.

**To approve**: `{ approved: true }`

**To deny**: `{ approved: false }`

## CLI Approval

Interactive CLI approval, as seen in the code-agent example.

```javascript
import readline from "readline";
import { compose, model, scope } from "@threaded/ai";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askUser = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === "y");
    });
  });
};

const approvalCallback = async (call) => {
  const args = JSON.parse(call.function.arguments);
  console.log(`\n[tool approval required]`);
  console.log(`tool: ${call.function.name}`);
  console.log(`args: ${JSON.stringify(args, null, 2)}`);

  const approved = await askUser("approve? (y/n): ");
  return approved;
};

const workflow = compose(
  scope(
    {
      tools: [readFileTool, writeFileTool, bashTool],
      toolConfig: {
        requireApproval: true,
        approvalCallback,
      },
    },
    model(),
  ),
);

await workflow("list all js files");
```

This prints the tool details, waits for user input, and returns the approval decision.

## Execute on Approval

By default, when the model requests multiple tools, the library waits for all approvals before executing any tools. This ensures tools run in the order the model intended.

Set `executeOnApproval: true` to execute tools immediately when approved, without waiting for other approvals.

```javascript
toolConfig: {
  requireApproval: true,
  approvalCallback,
  executeOnApproval: true,
}
```

**Default behavior (`executeOnApproval`: false):**

1. Model requests tools A, B, C
2. User approves A
3. User approves B
4. User approves C
5. All three execute (in order or parallel depending on `parallel` config)

**With `executeOnApproval`: true:**

1. Model requests tools A, B, C
2. User approves A - A executes immediately
3. User approves B - B executes immediately
4. User approves C - C executes immediately

This is useful when tools are independent and execution order does not matter. It is not recommended when tools depend on each other (e.g., read file then write file).

## Denial Handling

When a tool is denied, the model receives an error message in the tool response.

```json
{
  "error": "Tool execution denied by user"
}
```

The model can see this and adjust - it may ask for different parameters, try a different approach, or explain why the tool is needed.

## Streaming with Approval

Combine streaming and approval to show real-time status.

```javascript
scope(
  {
    tools: [weatherTool],
    toolConfig: {
      requireApproval: true,
      approvalCallback,
    },
    stream: (event) => {
      switch (event.type) {
        case "tool_calls_ready":
          console.log("model wants to call:", event.calls.map(c => c.function.name));
          break;
        case "tool_executing":
          console.log(`executing ${event.call.function.name}...`);
          break;
        case "tool_complete":
          console.log(`${event.call.function.name} returned:`, event.result);
          break;
        case "tool_error":
          console.log(`${event.call.function.name} failed:`, event.error);
          break;
      }
    },
  },
  model(),
);
```

Stream events fire during the approval flow. `tool_calls_ready` fires before approval, and `tool_executing` fires after approval is granted.
