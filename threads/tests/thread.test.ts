import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOrCreateThread } from "../src/thread";
import { compose } from "../src/composition/compose";
import { model } from "../src/composition/model";
import { ThreadStore, Message } from "../src/types";

vi.mock("../src/providers", () => ({
  callProvider: vi.fn(),
}));

import { callProvider } from "../src/providers";
const mockCallProvider = vi.mocked(callProvider);

const createMockStore = (): ThreadStore => {
  const storage = new Map<string, Message[]>();

  return {
    async get(threadId: string): Promise<Message[]> {
      return storage.get(threadId) || [];
    },
    async set(threadId: string, messages: Message[]): Promise<void> {
      storage.set(threadId, messages);
    },
  };
};

describe("thread message storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should preserve conversation history in thread with generate", async () => {
    const store = createMockStore();
    const thread = getOrCreateThread("test-thread-1", store);

    // pre-populate the store with initial history
    await store.set("test-thread-1", [{ role: "user", content: "hello" }]);

    mockCallProvider.mockImplementation(async (config, ctx) => ({
      ...ctx,
      history: [...ctx.history, { role: "assistant", content: "hi there!" }],
      lastResponse: { role: "assistant", content: "hi there!" },
    }));

    await thread.generate(compose(model()));

    const storedHistory = await store.get("test-thread-1");
    expect(storedHistory).toHaveLength(2);
    expect(storedHistory[0]).toEqual({ role: "user", content: "hello" });
    expect(storedHistory[1]).toEqual({
      role: "assistant",
      content: "hi there!",
    });
  });

  it("should preserve conversation history in thread with message", async () => {
    const store = createMockStore();
    const thread = getOrCreateThread("test-thread-2", store);

    mockCallProvider.mockImplementation(async (config, ctx) => ({
      ...ctx,
      history: [...ctx.history, { role: "assistant", content: "hi there!" }],
      lastResponse: { role: "assistant", content: "hi there!" },
    }));

    await thread.message("hello", compose(model()));

    const storedHistory = await store.get("test-thread-2");
    expect(storedHistory).toHaveLength(2);
    expect(storedHistory[0]).toEqual({ role: "user", content: "hello" });
    expect(storedHistory[1]).toEqual({
      role: "assistant",
      content: "hi there!",
    });
  });

  it("should accumulate messages across multiple calls", async () => {
    const store = createMockStore();
    const thread = getOrCreateThread("test-thread-3", store);

    mockCallProvider.mockImplementation(async (config, ctx) => ({
      ...ctx,
      history: [...ctx.history, { role: "assistant", content: "response" }],
      lastResponse: { role: "assistant", content: "response" },
    }));

    await thread.message("first message", compose(model()));
    await thread.message("second message", compose(model()));

    const storedHistory = await store.get("test-thread-3");
    expect(storedHistory).toHaveLength(4);
    expect(storedHistory[0]).toEqual({
      role: "user",
      content: "first message",
    });
    expect(storedHistory[1]).toEqual({
      role: "assistant",
      content: "response",
    });
    expect(storedHistory[2]).toEqual({
      role: "user",
      content: "second message",
    });
    expect(storedHistory[3]).toEqual({
      role: "assistant",
      content: "response",
    });
  });
});
