import { StepFunction, ConversationContext, RetryOptions } from "../types";

/**
 * scope({}, retry({ times: 2 }, model(...)))
 */
export const retry = (
  { times = 3 }: RetryOptions = {},
  step: StepFunction,
): StepFunction => {
  return async (ctx: ConversationContext): Promise<ConversationContext> => {
    let err: Error;

    for (let i = 0; i < times; i++) {
      try {
        return await step(ctx);
      } catch (e) {
        err = e as Error;
      }
    }

    throw err!;
  };
};
