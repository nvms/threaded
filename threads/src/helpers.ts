import { ConversationContext, StepFunction } from "./types";
import { when } from "./composition/when";

/**
 * scope({ until: noToolsCalled() })
 */
export const noToolsCalled =
  () =>
  (ctx: ConversationContext): boolean => {
    return (
      !ctx.lastResponse?.tool_calls || ctx.lastResponse.tool_calls.length === 0
    );
  };

export const everyNMessages = (n: number, step: StepFunction): StepFunction => {
  let lastTriggeredAt = 0;

  return when(
    (ctx) =>
      Math.floor(ctx.history.length / n) > Math.floor(lastTriggeredAt / n),
    async (ctx) => {
      lastTriggeredAt = ctx.history.length;
      return await step(ctx);
    },
  );
};

export const everyNTokens = (n: number, step: StepFunction): StepFunction => {
  let lastTriggeredAt = 0;

  return when(
    (ctx) => {
      const totalTokens = ctx.history.reduce(
        (acc, msg) => acc + Math.ceil(msg.content.length / 4),
        0,
      );
      return Math.floor(totalTokens / n) > Math.floor(lastTriggeredAt / n);
    },
    async (ctx) => {
      const totalTokens = ctx.history.reduce(
        (acc, msg) => acc + Math.ceil(msg.content.length / 4),
        0,
      );
      lastTriggeredAt = totalTokens;
      return await step(ctx);
    },
  );
};

export const appendToLastRequest = (content: string): StepFunction => {
  return async (ctx: ConversationContext): Promise<ConversationContext> => {
    let lastUserIndex = -1;
    for (let i = ctx.history.length - 1; i >= 0; i--) {
      if (ctx.history[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return ctx;

    const newHistory = [...ctx.history];
    newHistory[lastUserIndex] = {
      ...newHistory[lastUserIndex],
      content: newHistory[lastUserIndex].content + content,
    };

    return {
      ...ctx,
      history: newHistory,
    };
  };
};

/**
 * toolNotUsedInNTurns({ toolName: "search_web", times: 10 }, appendToLastRequest("consider using web search..."))
 */
export const toolNotUsedInNTurns = (
  { toolName, times }: { toolName: string; times: number },
  step: StepFunction,
): StepFunction => {
  let turnsSinceLastUsed = 0;
  let lastProcessedTurn = -1;

  return when((ctx) => {
    const currentTurn = getCurrentTurn(ctx);

    // only check once per turn
    if (currentTurn === lastProcessedTurn) return false;
    lastProcessedTurn = currentTurn;

    // check if tool was used in this turn
    const toolUsedInTurn = wasToolUsedInCurrentTurn(ctx, toolName);

    if (toolUsedInTurn) {
      turnsSinceLastUsed = 0;
      return false;
    } else {
      turnsSinceLastUsed++;
      return turnsSinceLastUsed >= times;
    }
  }, step);
};

const getCurrentTurn = (ctx: ConversationContext): number => {
  let turns = 0;
  for (const msg of ctx.history) {
    if (msg.role === "user") turns++;
  }
  return turns;
};

const wasToolUsedInCurrentTurn = (
  ctx: ConversationContext,
  toolName: string,
): boolean => {
  // find the last user message and check all messages after it for tool usage
  let lastUserIndex = -1;
  for (let i = ctx.history.length - 1; i >= 0; i--) {
    if (ctx.history[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex === -1) return false;

  // check messages after last user message for tool calls
  for (let i = lastUserIndex + 1; i < ctx.history.length; i++) {
    const msg = ctx.history[i];
    if (msg.role === "assistant" && ctx.lastResponse?.tool_calls) {
      return ctx.lastResponse.tool_calls.some(
        (call) => call.function.name === toolName,
      );
    }
  }

  return false;
};

export const toolWasCalled =
  (name: string) =>
  (ctx: ConversationContext): boolean => {
    return (
      !!ctx.lastResponse?.tool_calls &&
      ctx.lastResponse.tool_calls.some((call) => call.function.name === name)
    );
  };
