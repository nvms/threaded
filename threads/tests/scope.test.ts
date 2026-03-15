import { describe, it, expect } from "vitest";
import { scope } from "../src/composition/scope";
import { ConversationContext, Inherit } from "../src/types";

const createStep = (content: string) => async (ctx: ConversationContext) => ({
  ...ctx,
  history: [...ctx.history, { role: "assistant" as const, content }],
});

describe("scope", () => {
  describe("silent flag", () => {
    it("should return modified context when silent is false", async () => {
      const parentCtx: ConversationContext = {
        history: [{ role: "user", content: "parent" }],
        tools: [],
      };

      const step = createStep("scoped");
      const scoped = scope(
        { silent: false, inherit: Inherit.Conversation },
        step,
      );

      const result = await scoped(parentCtx);

      expect(result.history).toHaveLength(2);
      expect(result.history[1].content).toBe("scoped");
    });

    it("should return original context when silent is true", async () => {
      const parentCtx: ConversationContext = {
        history: [{ role: "user", content: "parent" }],
        tools: [],
      };

      const step = createStep("scoped");
      const scoped = scope(
        { silent: true, inherit: Inherit.Conversation },
        step,
      );

      const result = await scoped(parentCtx);

      expect(result.history).toHaveLength(1);
      expect(result.history[0].content).toBe("parent");
    });
  });

  describe("inherit flag", () => {
    it("should inherit conversation by default", async () => {
      const parentCtx: ConversationContext = {
        history: [{ role: "user", content: "parent" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test",
              description: "",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
      };

      const step = async (ctx: ConversationContext) => {
        expect(ctx.history).toHaveLength(1);
        expect(ctx.tools).toHaveLength(0);
        return ctx;
      };

      const scoped = scope({}, step);
      await scoped(parentCtx);
    });

    it("should inherit nothing when specified", async () => {
      const parentCtx: ConversationContext = {
        history: [{ role: "user", content: "parent" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test",
              description: "",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
      };

      const step = async (ctx: ConversationContext) => {
        expect(ctx.history).toHaveLength(0);
        expect(ctx.tools).toHaveLength(0);
        return ctx;
      };

      const scoped = scope({ inherit: Inherit.Nothing }, step);
      await scoped(parentCtx);
    });

    it("should inherit tools when specified", async () => {
      const parentCtx: ConversationContext = {
        history: [{ role: "user", content: "parent" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test",
              description: "",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        toolExecutors: { test: () => "result" },
      };

      const step = async (ctx: ConversationContext) => {
        expect(ctx.history).toHaveLength(0);
        expect(ctx.tools).toHaveLength(1);
        expect(ctx.toolExecutors?.test).toBeDefined();
        return ctx;
      };

      const scoped = scope({ inherit: Inherit.Tools }, step);
      await scoped(parentCtx);
    });

    it("should inherit all when specified", async () => {
      const parentCtx: ConversationContext = {
        history: [{ role: "user", content: "parent" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test",
              description: "",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
      };

      const step = async (ctx: ConversationContext) => {
        expect(ctx.history).toHaveLength(1);
        expect(ctx.tools).toHaveLength(1);
        return ctx;
      };

      const scoped = scope({ inherit: Inherit.All }, step);
      await scoped(parentCtx);
    });
  });
});
