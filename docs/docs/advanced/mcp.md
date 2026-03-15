# MCP Integration

Connect to Model Context Protocol servers and use their tools in your workflows.

MCP (Model Context Protocol) is a standard for exposing tools and resources to LLMs. MCP servers provide tools over stdio, SSE, or Streamable HTTP. This library converts MCP tools into native tool definitions that work with your workflows.

## Basic Usage

First, install the MCP SDK:

```bash
npm add @modelcontextprotocol/sdk
```

Then connect to an MCP server and convert its tools:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMCPTools, compose, model, scope } from "@threaded/ai";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});

const client = new Client({
  name: "my-agent",
  version: "1.0.0",
}, {
  capabilities: {},
});

await client.connect(transport);

const tools = await createMCPTools(client);

const workflow = compose(
  scope(
    {
      tools,
    },
    model(),
  ),
);

await workflow("list files in the current directory");
```

Here is what is happening:

1. **StdioClientTransport** launches the MCP server as a subprocess (in this case, the filesystem server with `/tmp` as the working directory).
2. **Client** creates an MCP client that communicates with the server over stdio.
3. **client.connect()** establishes the connection.
4. **createMCPTools()** fetches the server's tool list, converts each MCP tool to the Threads tool format, and wraps the execute function to call the MCP server.
5. The model can now call these tools like any other tool. When called, the library forwards the request to the MCP server and returns the result.

## Tool Naming

Tools are prefixed with the server name to avoid conflicts between servers.

```javascript
const tools = await createMCPTools(client);
```

If the server name is "filesystem" and it provides a tool called "read_file", the final tool name becomes "filesystem_read_file". The model sees this name in tool descriptions.

## Multiple MCP Servers

Connect to multiple servers and combine their tools.

```javascript
const fsTransport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});

const gitTransport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-git"],
});

const fsClient = new Client({ name: "fs-client", version: "1.0.0" }, { capabilities: {} });
const gitClient = new Client({ name: "git-client", version: "1.0.0" }, { capabilities: {} });

await fsClient.connect(fsTransport);
await gitClient.connect(gitTransport);

const fsTools = await createMCPTools(fsClient);
const gitTools = await createMCPTools(gitClient);

const workflow = compose(
  scope(
    {
      tools: [...fsTools, ...gitTools],
    },
    model(),
  ),
);

await workflow("show git status and list all js files");
```

The model now has access to both filesystem and git operations.
