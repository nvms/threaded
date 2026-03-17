import { ComposedFunction, ConversationContext, StepFunction } from "../types.js";

const enrichContext = (ctx: ConversationContext): ConversationContext => {
  const lastUserMessage = [...ctx.history]
    .reverse()
    .find((msg) => msg.role === "user");
  return {
    ...ctx,
    lastRequest: lastUserMessage,
  };
};

export const compose = (...steps: StepFunction[]): ComposedFunction => {
  return async (ctxOrMessage: ConversationContext | string): Promise<ConversationContext> => {
    let initialContext: ConversationContext;

    if (typeof ctxOrMessage === "string") {
      initialContext = {
        history: [{ role: "user", content: ctxOrMessage }],
        tools: [],
        toolExecutors: {},
        toolLimits: {},
        toolCallCounts: {},
      };
    } else {
      initialContext = ctxOrMessage || {
        history: [],
        tools: [],
        toolExecutors: {},
        toolLimits: {},
        toolCallCounts: {},
      };
    }

    let next = enrichContext(initialContext);

    for (const step of steps) {
      next = await step(enrichContext(next));
    }

    return next;
  };
};
