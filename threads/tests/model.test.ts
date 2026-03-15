import { describe, it, expect, vi, beforeEach } from "vitest";
import { model } from "../src/composition/model";
import { scope } from "../src/composition/scope";
import { maxCalls } from "../src/utils";
import { resolveApproval, onApprovalRequested } from "../src/approval";
import { ConversationContext, ToolConfig, Inherit } from "../src/types";

vi.mock("../src/providers", () => ({
  callProvider: vi.fn(),
}));

import { callProvider } from "../src/providers";
import { compose } from "../src/composition/compose";
const mockCallProvider = vi.mocked(callProvider);

const mockTool: ToolConfig = {
  name: "test_tool",
  description: "A test tool",
  schema: { message: { type: "string", description: "Message to return" } },
  execute: vi.fn().mockResolvedValue("tool result"),
};

const expensiveTool: ToolConfig = {
  name: "expensive_tool",
  description: "An expensive tool",
  schema: { input: { type: "string", description: "Input" } },
  execute: vi.fn().mockResolvedValue("expensive result"),
};

describe("model with tool execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should debug - check if scope sets up tools properly", async () => {
    const debugStep = vi
      .fn()
      .mockImplementation(async (ctx: ConversationContext) => {
        console.log("Context tools:", ctx.tools?.length);
        console.log(
          "Context toolExecutors:",
          Object.keys(ctx.toolExecutors || {}),
        );
        console.log("Context toolConfig:", ctx.toolConfig);
        return ctx;
      });

    const workflow = scope({ tools: [mockTool] }, debugStep);
    await workflow({ history: [{ role: "user", content: "test" }] });

    expect(debugStep).toHaveBeenCalled();
  });

  it("should execute tools automatically when present", async () => {
    // mock provider to preserve context and return tool calls on first call
    mockCallProvider.mockImplementation(async (config, ctx) => {
      const callCount = mockCallProvider.mock.calls.length;

      if (callCount === 1) {
        // first call - return tool calls
        return {
          ...ctx,
          lastResponse: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "1",
                function: {
                  name: "test_tool",
                  arguments: '{"message": "hello"}',
                },
              },
            ],
          },
        };
      } else {
        // second call - return final response
        return {
          ...ctx,
          lastResponse: { role: "assistant", content: "Done!" },
        };
      }
    });

    const workflow = compose(scope({ tools: [mockTool] }, model()));
    await workflow("test");

    expect(mockTool.execute).toHaveBeenCalledWith({ message: "hello" });
    expect(mockCallProvider).toHaveBeenCalledTimes(2);
  });

  it("should handle approval callback", async () => {
    mockCallProvider.mockImplementation(async (config, ctx) => {
      const callCount = mockCallProvider.mock.calls.length;

      if (callCount === 1) {
        return {
          ...ctx,
          lastResponse: {
            role: "assistant",
            content: "",
            tool_calls: [
              { id: "1", function: { name: "test_tool", arguments: "{}" } },
            ],
          },
        };
      } else {
        return {
          ...ctx,
          lastResponse: { role: "assistant", content: "Done!" },
        };
      }
    });

    const approvalCallback = vi.fn().mockReturnValue(true);

    const workflow = compose(
      scope(
        {
          tools: [mockTool],
          toolConfig: { requireApproval: true, approvalCallback },
        },
        model(),
      ),
    );

    await workflow("test");

    expect(approvalCallback).toHaveBeenCalledWith({
      id: "1",
      function: { name: "test_tool", arguments: "{}" },
    });
    expect(mockTool.execute).toHaveBeenCalled();
  });

  it("should handle approval denial", async () => {
    mockCallProvider.mockImplementation(async (config, ctx) => {
      const callCount = mockCallProvider.mock.calls.length;

      if (callCount === 1) {
        return {
          ...ctx,
          lastResponse: {
            role: "assistant",
            content: "",
            tool_calls: [
              { id: "1", function: { name: "test_tool", arguments: "{}" } },
            ],
          },
        };
      } else {
        return {
          ...ctx,
          lastResponse: { role: "assistant", content: "Done!" },
        };
      }
    });

    const approvalCallback = vi.fn().mockReturnValue(false);

    const workflow = compose(
      scope(
        {
          tools: [mockTool],
          toolConfig: { requireApproval: true, approvalCallback },
        },
        model(),
      ),
    );

    await workflow("test");

    expect(mockTool.execute).not.toHaveBeenCalled();
  });

  it("should handle event-driven approvals", async () => {
    mockCallProvider.mockImplementation(async (config, ctx) => {
      const callCount = mockCallProvider.mock.calls.length;

      if (callCount === 1) {
        return {
          ...ctx,
          lastResponse: {
            role: "assistant",
            content: "",
            tool_calls: [
              { id: "1", function: { name: "test_tool", arguments: "{}" } },
            ],
          },
        };
      } else {
        return {
          ...ctx,
          lastResponse: { role: "assistant", content: "Done!" },
        };
      }
    });

    // Set up event listener to auto-approve with slight delay
    onApprovalRequested((request) => {
      // setTimeout is required here because the event listener is called synchronously
      setTimeout(() => {
        resolveApproval({ id: request.id, approved: true });
      }, 10);
    });

    const workflow = compose(
      scope(
        {
          tools: [mockTool],
          toolConfig: { requireApproval: true },
        },
        model(),
      ),
    );

    await workflow("test");

    expect(mockTool.execute).toHaveBeenCalled();
  });

  it("should respect maxCalls limit", async () => {
    mockCallProvider.mockImplementation(async (config, ctx) => {
      const callCount = mockCallProvider.mock.calls.length;

      if (callCount === 1) {
        return {
          ...ctx,
          lastResponse: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "1",
                function: { name: "expensive_tool", arguments: "{}" },
              },
            ],
          },
        };
      } else {
        return {
          ...ctx,
          lastResponse: { role: "assistant", content: "Done!" },
        };
      }
    });

    const limitedTool = maxCalls(expensiveTool, 1);

    const workflow = compose(scope({ tools: [limitedTool] }, model()));

    // First call should work
    await workflow("test");
    expect(expensiveTool.execute).toHaveBeenCalledTimes(1);

    // Second call should be blocked
    vi.clearAllMocks();
    mockCallProvider.mockImplementation(async (config, ctx) => {
      const callCount = mockCallProvider.mock.calls.length;

      if (callCount === 1) {
        return {
          ...ctx,
          lastResponse: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "2",
                function: { name: "expensive_tool", arguments: "{}" },
              },
            ],
          },
        };
      } else {
        return {
          ...ctx,
          lastResponse: { role: "assistant", content: "Done!" },
        };
      }
    });

    const workflow2 = scope(
      {
        tools: [limitedTool],
        inherit: Inherit.Tools,
      },
      model(),
    );
    await workflow2({
      history: [{ role: "user", content: "test" }],
      toolCallCounts: { expensive_tool: 1 },
    });

    expect(expensiveTool.execute).not.toHaveBeenCalled();
  });

  it("should execute tools in parallel when configured", async () => {
    mockCallProvider.mockImplementation(async (config, ctx) => {
      const callCount = mockCallProvider.mock.calls.length;

      if (callCount === 1) {
        return {
          ...ctx,
          lastResponse: {
            role: "assistant",
            content: "",
            tool_calls: [
              { id: "1", function: { name: "test_tool", arguments: "{}" } },
              {
                id: "2",
                function: { name: "expensive_tool", arguments: "{}" },
              },
            ],
          },
        };
      } else {
        return {
          ...ctx,
          lastResponse: { role: "assistant", content: "Done!" },
        };
      }
    });

    const workflow = compose(
      scope(
        {
          tools: [mockTool, expensiveTool],
          toolConfig: { parallel: true },
        },
        model(),
      ),
    );

    await workflow("test");

    expect(mockTool.execute).toHaveBeenCalled();
    expect(expensiveTool.execute).toHaveBeenCalled();
  });
});
