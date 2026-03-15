import { describe, it, expect } from "vitest";
import { compose } from "../src/composition/compose";
import { ConversationContext, StepFunction } from "../src/types";

const createMockStep = (name: string): StepFunction => {
  return async (ctx: ConversationContext): Promise<ConversationContext> => {
    return {
      ...ctx,
      history: [...ctx.history, { role: "user", content: `step ${name}` }],
    };
  };
};

describe("compose", () => {
  it("should handle empty initial context", async () => {
    const step = createMockStep("test");
    const composed = compose(step);

    const result = await composed();

    expect(result.history).toHaveLength(1);
    expect(result.tools).toEqual([]);
  });

  it("should preserve existing context", async () => {
    const initialContext: ConversationContext = {
      history: [{ role: "system", content: "initial" }],
      tools: [],
    };

    const step = createMockStep("new");
    const composed = compose(step);

    const result = await composed(initialContext);

    expect(result.history).toHaveLength(2);
    expect(result.history[0].content).toBe("initial");
    expect(result.history[1].content).toBe("step new");
  });

  it("should set lastRequest to last user message", async () => {
    const initialContext: ConversationContext = {
      history: [
        { role: "system", content: "system" },
        { role: "user", content: "user message" },
        { role: "assistant", content: "assistant" },
      ],
      tools: [],
    };

    const step = async (ctx: ConversationContext) => ctx;
    const composed = compose(step);

    const result = await composed(initialContext);

    expect(result.lastRequest?.content).toBe("user message");
    expect(result.lastRequest?.role).toBe("user");
  });
});
