import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ToolConfig } from "./types";
import { convertMCPSchemaToToolSchema } from "./schema";

export interface MCPConnection {
  tools: ToolConfig[];
  name: string;
  reconnect: () => Promise<void>;
  close: () => Promise<void>;
}

export interface MCPConnectionConfig {
  transport: () => any;
  name?: string;
  version?: string;
}

export interface MCPManager {
  connect: (config: MCPConnectionConfig) => Promise<MCPConnection>;
  tools: ToolConfig[];
  reconnect: (name?: string) => Promise<void>;
  close: (name?: string) => Promise<void>;
}

const buildTools = async (client: any): Promise<ToolConfig[]> => {
  const serverInfo = client.getServerVersion();
  const serverName = serverInfo?.name;

  if (!serverName) {
    console.error("MCP server has no name? Skipping tool creation.");
    return [];
  }

  return (await client.listTools()).tools.map((mcpTool: any) => {
    const prefixedName = `${serverName}_${mcpTool.name}`;

    return {
      name: prefixedName,
      description: `[${serverName}] ${mcpTool.description || ""}`,
      schema: convertMCPSchemaToToolSchema(mcpTool.inputSchema),
      execute: async (args: any) => {
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: args,
        });
        return (
          (result.content &&
            Array.isArray(result.content) &&
            result.content[0]?.text) ||
          JSON.stringify(result)
        );
      },
    };
  });
};

export const connectMCP = async (config: MCPConnectionConfig): Promise<MCPConnection> => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");

  let client = new Client(
    { name: config.name || "threaded", version: config.version || "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(config.transport());
  let tools = await buildTools(client);
  const serverName = client.getServerVersion()?.name || config.name || "unknown";

  return {
    get tools() { return tools; },
    name: serverName,
    async reconnect() {
      await client.close();
      client = new Client(
        { name: config.name || "threaded", version: config.version || "1.0.0" },
        { capabilities: {} },
      );
      await client.connect(config.transport());
      tools = await buildTools(client);
    },
    async close() {
      await client.close();
      tools = [];
    },
  };
};

export const createMCPManager = (): MCPManager => {
  const connections = new Map<string, { connection: MCPConnection; config: MCPConnectionConfig }>();

  return {
    async connect(config: MCPConnectionConfig) {
      const connection = await connectMCP(config);
      connections.set(connection.name, { connection, config });
      return connection;
    },

    get tools() {
      return Array.from(connections.values()).flatMap(({ connection }) => connection.tools);
    },

    async reconnect(name?: string) {
      if (name) {
        const entry = connections.get(name);
        if (!entry) throw new Error(`MCP connection "${name}" not found`);
        await entry.connection.reconnect();
        return;
      }
      await Promise.all(
        Array.from(connections.values()).map(({ connection }) => connection.reconnect()),
      );
    },

    async close(name?: string) {
      if (name) {
        const entry = connections.get(name);
        if (!entry) throw new Error(`MCP connection "${name}" not found`);
        await entry.connection.close();
        connections.delete(name);
        return;
      }
      await Promise.all(
        Array.from(connections.values()).map(({ connection }) => connection.close()),
      );
      connections.clear();
    },
  };
};

