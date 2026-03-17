import { ConversationContext, StepFunction } from "../types.js";

export const when = (
  condition: (ctx: ConversationContext) => boolean,
  action: StepFunction,
): StepFunction => {
  return async (ctx: ConversationContext): Promise<ConversationContext> => {
    if (condition(ctx)) {
      return await action(ctx);
    }
    return ctx;
  };
};
