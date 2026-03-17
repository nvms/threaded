import { ConversationContext, StepFunction } from "../types.js";

export const tap = (
  fn: (ctx: ConversationContext) => Promise<void> | void,
): StepFunction => {
  return async (ctx: ConversationContext): Promise<ConversationContext> => {
    await fn(ctx);
    return ctx;
  };
};
