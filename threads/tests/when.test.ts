import { describe, it, expect, vi } from "vitest";
import { when } from "../src/composition/when";
import { ConversationContext } from "../src/types";

describe("when", () => {
  it("should execute action when condition is true", async () => {
    const mockAction = vi.fn().mockResolvedValue({
      history: [{ role: "user", content: "action executed" }],
      tools: [],
    });

    const condition = () => true;
    const conditional = when(condition, mockAction);

    const ctx: ConversationContext = { history: [], tools: [] };
    await conditional(ctx);

    expect(mockAction).toHaveBeenCalledWith(ctx);
  });

  it("should not execute action when condition is false", async () => {
    const mockAction = vi.fn();
    const condition = () => false;
    const conditional = when(condition, mockAction);

    const ctx: ConversationContext = { history: [], tools: [] };
    const result = await conditional(ctx);

    expect(mockAction).not.toHaveBeenCalled();
    expect(result).toBe(ctx);
  });

  it("should return action result when condition is true", async () => {
    const expectedResult = {
      history: [{ role: "assistant", content: "result" }],
      tools: [],
    };
    const mockAction = vi.fn().mockResolvedValue(expectedResult);
    const condition = () => true;
    const conditional = when(condition, mockAction);

    const ctx: ConversationContext = { history: [], tools: [] };
    const result = await conditional(ctx);

    expect(result).toBe(expectedResult);
  });

  it("should pass context to condition function", async () => {
    const mockCondition = vi.fn().mockReturnValue(false);
    const mockAction = vi.fn();
    const conditional = when(mockCondition, mockAction);

    const ctx: ConversationContext = {
      history: [{ role: "user", content: "test" }],
      tools: [],
    };
    await conditional(ctx);

    expect(mockCondition).toHaveBeenCalledWith(ctx);
  });
});
