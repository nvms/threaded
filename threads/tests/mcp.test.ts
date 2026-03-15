import { describe, it, expect, vi, beforeEach } from "vitest";
import { connectMCP, createMCPManager } from "../src/mcp";

const mockTools = [
  {
    name: "read_file",
    description: "Read a file",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write a file",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
];

const createMockClient = (serverName: string, tools = mockTools) => ({
  connect: vi.fn(),
  close: vi.fn(),
  getServerVersion: () => ({ name: serverName }),
  listTools: vi.fn().mockResolvedValue({ tools }),
  callTool: vi.fn().mockResolvedValue({ content: [{ text: "result" }] }),
});

let mockClientFactory: (info: any) => any;

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation((info) => {
    return mockClientFactory(info);
  }),
}));

beforeEach(() => {
  mockClientFactory = (info) => createMockClient(info.name);
});

describe("connectMCP", () => {
  it("connects and returns tools", async () => {
    const conn = await connectMCP({
      transport: () => ({}),
      name: "filesystem",
    });

    expect(conn.tools).toHaveLength(2);
    expect(conn.tools[0].name).toBe("filesystem_read_file");
    expect(conn.tools[1].name).toBe("filesystem_write_file");
    expect(conn.name).toBe("filesystem");
  });

  it("tools execute against the client", async () => {
    const conn = await connectMCP({
      transport: () => ({}),
      name: "filesystem",
    });

    const result = await conn.tools[0].execute({ path: "/tmp/test" });
    expect(result).toBe("result");
  });

  it("reconnect refreshes tools", async () => {
    let callCount = 0;
    mockClientFactory = (info: any) => {
      callCount++;
      const client = createMockClient(info.name);
      if (callCount > 1) {
        client.listTools.mockResolvedValue({
          tools: [...mockTools, {
            name: "delete_file",
            description: "Delete a file",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          }],
        });
      }
      return client;
    };

    const conn = await connectMCP({
      transport: () => ({}),
      name: "filesystem",
    });

    expect(conn.tools).toHaveLength(2);

    await conn.reconnect();

    expect(conn.tools).toHaveLength(3);
    expect(conn.tools[2].name).toBe("filesystem_delete_file");
  });

  it("close clears tools", async () => {
    const conn = await connectMCP({
      transport: () => ({}),
      name: "filesystem",
    });

    expect(conn.tools).toHaveLength(2);

    await conn.close();

    expect(conn.tools).toHaveLength(0);
  });

  it("transport factory is called on each connect", async () => {
    const factory = vi.fn().mockReturnValue({});

    const conn = await connectMCP({
      transport: factory,
      name: "filesystem",
    });

    expect(factory).toHaveBeenCalledTimes(1);

    await conn.reconnect();

    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe("createMCPManager", () => {
  it("aggregates tools from multiple connections", async () => {
    const manager = createMCPManager();

    await manager.connect({ transport: () => ({}), name: "filesystem" });
    await manager.connect({ transport: () => ({}), name: "git" });

    expect(manager.tools).toHaveLength(4);
    expect(manager.tools.map(t => t.name)).toEqual([
      "filesystem_read_file",
      "filesystem_write_file",
      "git_read_file",
      "git_write_file",
    ]);
  });

  it("reconnect all refreshes every connection", async () => {
    const manager = createMCPManager();

    await manager.connect({ transport: () => ({}), name: "filesystem" });
    await manager.connect({ transport: () => ({}), name: "git" });

    await manager.reconnect();

    expect(manager.tools).toHaveLength(4);
  });

  it("reconnect by name refreshes only that connection", async () => {
    const manager = createMCPManager();

    await manager.connect({ transport: () => ({}), name: "filesystem" });
    await manager.connect({ transport: () => ({}), name: "git" });

    await manager.reconnect("filesystem");

    expect(manager.tools).toHaveLength(4);
  });

  it("reconnect unknown name throws", async () => {
    const manager = createMCPManager();

    await expect(manager.reconnect("nope")).rejects.toThrow('MCP connection "nope" not found');
  });

  it("close by name removes that connection", async () => {
    const manager = createMCPManager();

    await manager.connect({ transport: () => ({}), name: "filesystem" });
    await manager.connect({ transport: () => ({}), name: "git" });

    await manager.close("filesystem");

    expect(manager.tools).toHaveLength(2);
    expect(manager.tools[0].name).toBe("git_read_file");
  });

  it("close all removes everything", async () => {
    const manager = createMCPManager();

    await manager.connect({ transport: () => ({}), name: "filesystem" });
    await manager.connect({ transport: () => ({}), name: "git" });

    await manager.close();

    expect(manager.tools).toHaveLength(0);
  });

  it("close unknown name throws", async () => {
    const manager = createMCPManager();

    await expect(manager.close("nope")).rejects.toThrow('MCP connection "nope" not found');
  });
});
