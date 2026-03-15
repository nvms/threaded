import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ToolConfig } from "./types";
import { convertMCPSchemaToToolSchema } from "./schema";

export const createMCPTools = async (client: any): Promise<ToolConfig[]> => {
  const serverInfo = client.getServerVersion();
  const serverName = serverInfo?.name;

  if (!serverName) {
    console.error("MCP server has no name? Skipping tool creation.");
    return [];
  }

  const toolsResponse = await client.listTools();

  return toolsResponse.tools.map((mcpTool: any) => {
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
