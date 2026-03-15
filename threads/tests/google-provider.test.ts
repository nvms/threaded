import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callGoogle } from "../src/providers/google";
import { ConversationContext } from "../src/types";

describe("Google provider tool call formatting", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let capturedBody: any;

  beforeEach(() => {
    capturedBody = null;
    fetchSpy = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: "Done!" }],
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats tool results as functionResponse", async () => {
    const ctx: ConversationContext = {
      history: [
        { role: "user", content: "Edit the document" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: {
                name: "edit_document",
                arguments: JSON.stringify({ documentId: 1, patches: "[]" }),
              },
            },
          ],
        } as any,
        {
          role: "tool",
          content: JSON.stringify({ success: true, documentId: 1 }),
          tool_call_id: "call_123",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "edit_document",
            description: "Edit a document",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    expect(capturedBody.contents).toHaveLength(3);

    const userMsg = capturedBody.contents[0];
    expect(userMsg.role).toBe("user");
    expect(userMsg.parts[0].text).toBe("Edit the document");

    const modelMsg = capturedBody.contents[1];
    expect(modelMsg.role).toBe("model");
    expect(modelMsg.parts[0].functionCall).toEqual({
      name: "edit_document",
      args: { documentId: 1, patches: "[]" },
    });

    const toolResultMsg = capturedBody.contents[2];
    expect(toolResultMsg.role).toBe("user");
    expect(toolResultMsg.parts[0].functionResponse).toEqual({
      name: "edit_document",
      response: { success: true, documentId: 1 },
    });
  });

  it("groups multiple consecutive tool results into single user message", async () => {
    const ctx: ConversationContext = {
      history: [
        { role: "user", content: "Get weather for two cities" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "get_weather",
                arguments: JSON.stringify({ city: "NYC" }),
              },
            },
            {
              id: "call_2",
              type: "function",
              function: {
                name: "get_weather",
                arguments: JSON.stringify({ city: "LA" }),
              },
            },
          ],
        } as any,
        {
          role: "tool",
          content: JSON.stringify({ temp: 20 }),
          tool_call_id: "call_1",
        },
        {
          role: "tool",
          content: JSON.stringify({ temp: 25 }),
          tool_call_id: "call_2",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    expect(capturedBody.contents).toHaveLength(3);

    const modelMsg = capturedBody.contents[1];
    expect(modelMsg.parts).toHaveLength(2);
    expect(modelMsg.parts[0].functionCall.args.city).toBe("NYC");
    expect(modelMsg.parts[1].functionCall.args.city).toBe("LA");

    const toolResultMsg = capturedBody.contents[2];
    expect(toolResultMsg.role).toBe("user");
    expect(toolResultMsg.parts).toHaveLength(2);
    expect(toolResultMsg.parts[0].functionResponse.name).toBe("get_weather");
    expect(toolResultMsg.parts[0].functionResponse.response.temp).toBe(20);
    expect(toolResultMsg.parts[1].functionResponse.name).toBe("get_weather");
    expect(toolResultMsg.parts[1].functionResponse.response.temp).toBe(25);
  });

  it("handles assistant message with both content and tool_calls", async () => {
    const ctx: ConversationContext = {
      history: [
        { role: "user", content: "Check something" },
        {
          role: "assistant",
          content: "Let me check that for you.",
          tool_calls: [
            {
              id: "call_abc",
              type: "function",
              function: {
                name: "check_status",
                arguments: JSON.stringify({}),
              },
            },
          ],
        } as any,
        {
          role: "tool",
          content: JSON.stringify({ status: "ok" }),
          tool_call_id: "call_abc",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "check_status",
            description: "Check status",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    const modelMsg = capturedBody.contents[1];
    expect(modelMsg.parts).toHaveLength(2);
    expect(modelMsg.parts[0].text).toBe("Let me check that for you.");
    expect(modelMsg.parts[1].functionCall.name).toBe("check_status");
  });

  it("skips tool results with missing tool_call_id mapping", async () => {
    const ctx: ConversationContext = {
      history: [
        { role: "user", content: "Do something" },
        {
          role: "tool",
          content: JSON.stringify({ orphan: true }),
          tool_call_id: "nonexistent_id",
        },
      ],
      tools: [],
    };

    await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    expect(capturedBody.contents).toHaveLength(1);
    expect(capturedBody.contents[0].parts[0].text).toBe("Do something");
  });

  it("includes instructions as initial user/model exchange", async () => {
    const ctx: ConversationContext = {
      history: [{ role: "user", content: "Hello" }],
      tools: [],
    };

    await callGoogle(
      { model: "gemini-2.0-flash", instructions: "You are helpful" },
      ctx
    );

    expect(capturedBody.contents).toHaveLength(3);
    expect(capturedBody.contents[0].parts[0].text).toBe("You are helpful");
    expect(capturedBody.contents[1].parts[0].text).toBe("I understand.");
    expect(capturedBody.contents[2].parts[0].text).toBe("Hello");
  });

  it("streaming: formats tool results correctly", async () => {
    const encoder = new TextEncoder();
    const streamData = [
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"edit_document","args":{"documentId":1}}}]}}]}\n\n',
    ];

    let streamIndex = 0;
    const mockReader = {
      read: async () => {
        if (streamIndex < streamData.length) {
          return { done: false, value: encoder.encode(streamData[streamIndex++]) };
        }
        return { done: true, value: undefined };
      },
      releaseLock: () => {},
    };

    let firstCallCapturedBody: any = null;
    let callCount = 0;

    fetchSpy.mockImplementation(async (url: string, options: any) => {
      callCount++;
      const body = JSON.parse(options.body);

      if (callCount === 1) {
        return {
          ok: true,
          body: { getReader: () => mockReader },
        };
      } else {
        firstCallCapturedBody = body;
        return {
          ok: true,
          body: {
            getReader: () => ({
              read: async () => ({
                done: false,
                value: encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"Done!"}]}}]}\n\n'),
              }),
              releaseLock: () => {},
            }),
          },
        };
      }
    });

    let ctx: ConversationContext = {
      history: [{ role: "user", content: "Edit it" }],
      tools: [
        {
          type: "function",
          function: {
            name: "edit_document",
            description: "Edit",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      stream: () => {},
    };

    ctx = await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    expect(ctx.lastResponse?.tool_calls).toHaveLength(1);
    expect(ctx.lastResponse?.tool_calls?.[0].function.name).toBe("edit_document");

    const toolCall = ctx.lastResponse!.tool_calls![0];
    ctx = {
      ...ctx,
      history: [
        ...ctx.history,
        {
          role: "tool" as const,
          content: JSON.stringify({ success: true }),
          tool_call_id: toolCall.id,
        },
      ],
    };

    streamIndex = 0;
    fetchSpy.mockImplementation(async (url: string, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (streamIndex++ === 0) {
                return {
                  done: false,
                  value: encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"Done!"}]}}]}\n\n'),
                };
              }
              return { done: true, value: undefined };
            },
            releaseLock: () => {},
          }),
        },
      };
    });

    await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    expect(capturedBody.contents).toHaveLength(3);
    expect(capturedBody.contents[1].parts[0].functionCall).toBeDefined();
    expect(capturedBody.contents[2].parts[0].functionResponse).toBeDefined();
  });

  it("simulates full tool execution loop", async () => {
    let callCount = 0;
    fetchSpy.mockImplementation(async (url: string, options: any) => {
      capturedBody = JSON.parse(options.body);
      callCount++;

      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: "edit_document",
                        args: { documentId: 1 },
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      } else {
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: "Done!" }],
                },
              },
            ],
          }),
        };
      }
    });

    let ctx: ConversationContext = {
      history: [{ role: "user", content: "Edit the document" }],
      tools: [
        {
          type: "function",
          function: {
            name: "edit_document",
            description: "Edit a document",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      toolExecutors: {
        edit_document: async () => ({ success: true }),
      },
    };

    ctx = await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    expect(ctx.lastResponse?.tool_calls).toBeDefined();
    expect(ctx.lastResponse?.tool_calls?.[0].function.name).toBe("edit_document");

    const toolCall = ctx.lastResponse!.tool_calls![0];
    ctx = {
      ...ctx,
      history: [
        ...ctx.history,
        {
          role: "tool" as const,
          content: JSON.stringify({ success: true }),
          tool_call_id: toolCall.id,
        },
      ],
    };

    ctx = await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    expect(callCount).toBe(2);

    expect(capturedBody.contents).toHaveLength(3);
    expect(capturedBody.contents[1].parts[0].functionCall).toBeDefined();
    expect(capturedBody.contents[2].parts[0].functionResponse).toBeDefined();
    expect(capturedBody.contents[2].parts[0].functionResponse.name).toBe("edit_document");
  });

  it("preserves and sends thoughtSignature for Gemini 3 models", async () => {
    const ctx: ConversationContext = {
      history: [
        { role: "user", content: "Edit the document" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: {
                name: "edit_document",
                arguments: JSON.stringify({ documentId: 1 }),
              },
              thoughtSignature: "encrypted_thought_abc123",
            },
          ],
        } as any,
        {
          role: "tool",
          content: JSON.stringify({ success: true }),
          tool_call_id: "call_123",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "edit_document",
            description: "Edit a document",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    await callGoogle({ model: "gemini-3-pro-preview" }, ctx);

    const modelMsg = capturedBody.contents[1];
    expect(modelMsg.parts[0].functionCall).toBeDefined();
    expect(modelMsg.parts[0].thoughtSignature).toBe("encrypted_thought_abc123");
  });

  it("handles history after JSON serialization/deserialization (database storage)", async () => {
    const originalHistory = [
      { role: "user", content: "Edit the document" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: {
              name: "edit_document",
              arguments: JSON.stringify({ documentId: 1 }),
            },
          },
        ],
      },
      {
        role: "tool",
        content: JSON.stringify({ success: true }),
        tool_call_id: "call_123",
      },
    ];

    const serialized = JSON.stringify(originalHistory);
    const deserialized = JSON.parse(serialized);

    const ctx: ConversationContext = {
      history: deserialized,
      tools: [
        {
          type: "function",
          function: {
            name: "edit_document",
            description: "Edit a document",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    expect(capturedBody.contents).toHaveLength(3);

    const modelMsg = capturedBody.contents[1];
    expect(modelMsg.parts[0].functionCall).toBeDefined();
    expect(modelMsg.parts[0].functionCall.name).toBe("edit_document");

    const toolResultMsg = capturedBody.contents[2];
    expect(toolResultMsg.parts[0].functionResponse).toBeDefined();
    expect(toolResultMsg.parts[0].functionResponse.name).toBe("edit_document");
  });

  it("wraps array tool results in object for Google API compatibility", async () => {
    const ctx: ConversationContext = {
      history: [
        { role: "user", content: "List documents" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_list",
              type: "function",
              function: {
                name: "list_documents",
                arguments: JSON.stringify({}),
              },
            },
          ],
        } as any,
        {
          role: "tool",
          content: JSON.stringify([
            { id: 1, name: "Doc 1" },
            { id: 2, name: "Doc 2" },
          ]),
          tool_call_id: "call_list",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "list_documents",
            description: "List documents",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    await callGoogle({ model: "gemini-2.0-flash" }, ctx);

    const toolResultMsg = capturedBody.contents[2];
    expect(toolResultMsg.role).toBe("user");
    expect(toolResultMsg.parts[0].functionResponse.name).toBe("list_documents");
    expect(toolResultMsg.parts[0].functionResponse.response).toEqual({
      result: [
        { id: 1, name: "Doc 1" },
        { id: 2, name: "Doc 2" },
      ],
    });
  });
});
