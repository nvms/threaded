# MCP Integration

Connect to Model Context Protocol servers and use their tools in your workflows.

MCP (Model Context Protocol) is a standard for exposing tools and resources to LLMs. MCP servers provide tools over stdio, SSE, or Streamable HTTP. This library manages MCP connections and converts server tools into native tool definitions that work with your workflows.

## Basic Usage

First, install the MCP SDK:

```bash
npm add @modelcontextprotocol/sdk
```

Then connect to an MCP server:

```javascript
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { connectMCP, compose, model, scope } from "@threaded/ai";

const mcp = await connectMCP({
  transport: () => new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  }),
  name: "filesystem",
});

const workflow = compose(
  scope({ tools: mcp.tools }, model()),
);

await workflow("list files in the current directory");
```

`connectMCP` creates an MCP client, connects via the transport, fetches the server's tool list, and converts each tool to the Threads format. The `transport` option is a factory function so the connection can be re-established on reconnect.

## Tool Naming

Tools are prefixed with the server name to avoid conflicts between servers.

If the server name is "filesystem" and it provides a tool called "read_file", the final tool name becomes "filesystem_read_file". The model sees this name in tool descriptions.

## Reconnecting

Reload an MCP server's tools without restarting your process:

```javascript
const mcp = await connectMCP({
  transport: () => new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  }),
  name: "filesystem",
});

// server tools changed, or connection dropped
await mcp.reconnect();

// mcp.tools is now refreshed
```

`reconnect` closes the existing connection, creates a new client and transport, and re-fetches the tool list. Since `mcp.tools` is a live getter, any scope referencing it gets the updated tools on the next run.

## Multiple MCP Servers

Use `createMCPManager` to manage multiple connections:

```javascript
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMCPManager, compose, model, scope } from "@threaded/ai";

const mcp = createMCPManager();

await mcp.connect({
  transport: () => new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  }),
  name: "filesystem",
});

await mcp.connect({
  transport: () => new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-git"],
  }),
  name: "git",
});

const workflow = compose(
  scope({ tools: mcp.tools }, model()),
);

await workflow("show git status and list all js files");
```

`mcp.tools` aggregates tools from all connected servers.

```javascript
// reconnect all servers
await mcp.reconnect();

// reconnect a specific server
await mcp.reconnect("filesystem");

// close a specific server
await mcp.close("filesystem");

// close all servers
await mcp.close();
```
