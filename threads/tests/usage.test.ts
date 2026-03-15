import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callOpenAI } from "../src/providers/openai";
import { callAnthropic } from "../src/providers/anthropic";
import { callGoogle } from "../src/providers/google";
import { callXAI } from "../src/providers/xai";
import { callOpenAI } from "../src/providers/openai";
import { ConversationContext, StreamEvent } from "../src/types";
import { scope } from "../src/composition/scope";
import { model } from "../src/composition/model";
import { addUsage } from "../src/utils";

const baseCtx = (): ConversationContext => ({
  history: [{ role: "user", content: "Hello" }],
});

const mockOpenAIResponse = (usage?: any) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { role: "assistant", content: "Hi there" } }],
    usage,
  }),
});

const mockAnthropicResponse = (usage?: any) => ({
  ok: true,
  json: async () => ({
    content: [{ type: "text", text: "Hi there" }],
    usage,
  }),
});

const mockGoogleResponse = (usageMetadata?: any) => ({
  ok: true,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: "Hi there" }] } }],
    usageMetadata,
  }),
});

describe("addUsage", () => {
  it("accumulates from undefined", () => {
    const result = addUsage(undefined, 10, 20, 30);
    expect(result).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it("accumulates onto existing", () => {
    const existing = { promptTokens: 5, completionTokens: 10, totalTokens: 15 };
    const result = addUsage(existing, 10, 20, 30);
    expect(result).toEqual({ promptTokens: 15, completionTokens: 30, totalTokens: 45 });
  });
});

describe("OpenAI usage tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("extracts usage from non-streaming response", async () => {
    (fetch as any).mockResolvedValue(
      mockOpenAIResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
    );

    const result = await callOpenAI({ model: "gpt-4o-mini" }, baseCtx());
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it("handles missing usage gracefully", async () => {
    (fetch as any).mockResolvedValue(mockOpenAIResponse());

    const result = await callOpenAI({ model: "gpt-4o-mini" }, baseCtx());
    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it("accumulates usage across calls", async () => {
    (fetch as any).mockResolvedValue(
      mockOpenAIResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
    );

    let ctx = await callOpenAI({ model: "gpt-4o-mini" }, baseCtx());
    ctx.history.push({ role: "user", content: "Follow up" });

    (fetch as any).mockResolvedValue(
      mockOpenAIResponse({ prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 })
    );

    ctx = await callOpenAI({ model: "gpt-4o-mini" }, ctx);
    expect(ctx.usage).toEqual({ promptTokens: 25, completionTokens: 45, totalTokens: 70 });
  });

  it("extracts usage from streaming response", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: async () => {
        if (chunkIndex < chunks.length) {
          return { done: false, value: encoder.encode(chunks[chunkIndex++]) };
        }
        return { done: true, value: undefined };
      },
      releaseLock: () => {},
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const events: StreamEvent[] = [];
    const ctx = { ...baseCtx(), stream: (e: StreamEvent) => events.push(e) };

    const result = await callOpenAI({ model: "gpt-4o-mini" }, ctx);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(events.find(e => e.type === "usage")).toEqual({
      type: "usage",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
  });

  it("sends stream_options when streaming", async () => {
    const encoder = new TextEncoder();
    const mockReader = {
      read: async () => ({ done: true, value: undefined }),
      releaseLock: () => {},
    };

    let capturedBody: any;
    (fetch as any).mockImplementation(async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, body: { getReader: () => mockReader } };
    });

    const ctx = { ...baseCtx(), stream: () => {} };
    await callOpenAI({ model: "gpt-4o-mini" }, ctx);

    expect(capturedBody.stream_options).toEqual({ include_usage: true });
  });
});

describe("Anthropic usage tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("extracts usage from non-streaming response", async () => {
    (fetch as any).mockResolvedValue(
      mockAnthropicResponse({ input_tokens: 25, output_tokens: 15 })
    );

    const result = await callAnthropic({ model: "claude-sonnet-4-5-20250929" }, baseCtx());
    expect(result.usage).toEqual({ promptTokens: 25, completionTokens: 15, totalTokens: 40 });
  });

  it("handles missing usage gracefully", async () => {
    (fetch as any).mockResolvedValue(mockAnthropicResponse());

    const result = await callAnthropic({ model: "claude-sonnet-4-5-20250929" }, baseCtx());
    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it("extracts usage from streaming response", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":25,"output_tokens":1}}}\n\n',
      'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":15}}\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: async () => {
        if (chunkIndex < chunks.length) {
          return { done: false, value: encoder.encode(chunks[chunkIndex++]) };
        }
        return { done: true, value: undefined };
      },
      releaseLock: () => {},
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const events: StreamEvent[] = [];
    const ctx = { ...baseCtx(), stream: (e: StreamEvent) => events.push(e) };

    const result = await callAnthropic({ model: "claude-sonnet-4-5-20250929" }, ctx);
    expect(result.usage).toEqual({ promptTokens: 25, completionTokens: 15, totalTokens: 40 });

    const usageEvent = events.find(e => e.type === "usage") as any;
    expect(usageEvent.usage.promptTokens).toBe(25);
    expect(usageEvent.usage.completionTokens).toBe(15);
  });
});

describe("Google usage tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.GEMINI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("extracts usage from non-streaming response", async () => {
    (fetch as any).mockResolvedValue(
      mockGoogleResponse({ promptTokenCount: 9, candidatesTokenCount: 87, totalTokenCount: 96 })
    );

    const result = await callGoogle({ model: "gemini-2.0-flash" }, baseCtx());
    expect(result.usage).toEqual({ promptTokens: 9, completionTokens: 87, totalTokens: 96 });
  });

  it("handles missing usageMetadata gracefully", async () => {
    (fetch as any).mockResolvedValue(mockGoogleResponse());

    const result = await callGoogle({ model: "gemini-2.0-flash" }, baseCtx());
    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it("extracts usage from streaming response", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":5,"totalTokenCount":14}}\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: async () => {
        if (chunkIndex < chunks.length) {
          return { done: false, value: encoder.encode(chunks[chunkIndex++]) };
        }
        return { done: true, value: undefined };
      },
      releaseLock: () => {},
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const events: StreamEvent[] = [];
    const ctx = { ...baseCtx(), stream: (e: StreamEvent) => events.push(e) };

    const result = await callGoogle({ model: "gemini-2.0-flash" }, ctx);
    expect(result.usage).toEqual({ promptTokens: 9, completionTokens: 5, totalTokens: 14 });
    expect(events.find(e => e.type === "usage")).toBeDefined();
  });
});

describe("xAI usage tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.XAI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.XAI_API_KEY;
  });

  it("extracts usage from non-streaming response", async () => {
    (fetch as any).mockResolvedValue(
      mockOpenAIResponse({ prompt_tokens: 37, completion_tokens: 530, total_tokens: 567 })
    );

    const result = await callXAI({ model: "grok-3" }, baseCtx());
    expect(result.usage).toEqual({ promptTokens: 37, completionTokens: 530, totalTokens: 567 });
  });
});

describe("Ollama usage tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts usage from non-streaming response", async () => {
    (fetch as any).mockResolvedValue(
      mockOpenAIResponse({ prompt_tokens: 16, completion_tokens: 1, total_tokens: 17 })
    );

    const result = await callOpenAI({ model: "llama3", baseUrl: "http://localhost:11434/v1" }, baseCtx());
    expect(result.usage).toEqual({ promptTokens: 16, completionTokens: 1, totalTokens: 17 });
  });
});

describe("scope usage propagation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("propagates usage from inner scope to outer context", async () => {
    (fetch as any).mockResolvedValue(
      mockOpenAIResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
    );

    const step = scope({}, model({ model: "openai/gpt-4o-mini" }));
    const result = await step(baseCtx());
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it("propagates usage from silent scopes", async () => {
    (fetch as any).mockResolvedValue(
      mockOpenAIResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
    );

    const step = scope({ silent: true }, model({ model: "openai/gpt-4o-mini" }));
    const result = await step(baseCtx());

    expect(result.history).toHaveLength(1);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it("accumulates usage across nested scopes", async () => {
    let callCount = 0;
    (fetch as any).mockImplementation(async () => {
      callCount++;
      return mockOpenAIResponse({
        prompt_tokens: 10 * callCount,
        completion_tokens: 20 * callCount,
        total_tokens: 30 * callCount,
      });
    });

    const step = scope({},
      model({ model: "openai/gpt-4o-mini" }),
      scope({}, model({ model: "openai/gpt-4o-mini" })),
    );
    const result = await step(baseCtx());

    expect(result.usage).toEqual({ promptTokens: 30, completionTokens: 60, totalTokens: 90 });
  });

  it("carries pre-existing usage into scoped context", async () => {
    (fetch as any).mockResolvedValue(
      mockOpenAIResponse({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
    );

    const ctx = {
      ...baseCtx(),
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    };
    const step = scope({}, model({ model: "openai/gpt-4o-mini" }));
    const result = await step(ctx);

    expect(result.usage).toEqual({ promptTokens: 110, completionTokens: 220, totalTokens: 330 });
  });
});
