import { compose } from "./compose";
import {
  ConversationContext,
  Inherit,
  ScopeConfig,
  StepFunction,
} from "../types";
import { toolConfigToToolDefinition } from "../utils";

const scopeContext = (
  config: ScopeConfig,
  ctx: ConversationContext,
): ConversationContext => {
  const inherit = config.inherit ?? Inherit.Conversation;

  let scopedCtx: ConversationContext = {
    history: [],
    tools: [],
    toolExecutors: {},
    toolLimits: {},
    toolCallCounts: {},
  };

  // inheritance

  if (inherit & Inherit.Conversation) {
    scopedCtx.history = ctx.history;
    scopedCtx.lastResponse = ctx.lastResponse;
    scopedCtx.lastRequest = ctx.lastRequest;
  }

  if (inherit & Inherit.Tools) {
    scopedCtx.tools = [...(ctx.tools || [])];
    scopedCtx.toolExecutors = { ...(ctx.toolExecutors || {}) };
    scopedCtx.toolLimits = { ...(ctx.toolLimits || {}) };
    scopedCtx.toolCallCounts = { ...(ctx.toolCallCounts || {}) };
    scopedCtx.toolConfig = ctx.toolConfig ? { ...ctx.toolConfig } : undefined;
  }

  scopedCtx.stream = ctx.stream;
  scopedCtx.abortSignal = ctx.abortSignal;
  scopedCtx.usage = ctx.usage;

  if (config.tools) {
    const toolDefinitions = config.tools.map(toolConfigToToolDefinition);
    const toolExecutors = config.tools.reduce(
      (acc, tool) => {
        acc[tool.name] = tool.execute;

        return acc;
      },
      {} as Record<string, Function>,
    );
    const toolLimits = config.tools.reduce(
      (acc, tool) => {
        if (tool._maxCalls) {
          acc[tool.name] = tool._maxCalls;
        }

        return acc;
      },
      {} as Record<string, number>,
    );

    scopedCtx.tools = toolDefinitions;
    scopedCtx.toolExecutors = toolExecutors;
    scopedCtx.toolLimits = toolLimits;
  }

  if (config.toolConfig) {
    scopedCtx.toolConfig = { ...config.toolConfig };
  }

  if (config.system) {
    const [first, ...rest] = scopedCtx.history;
    if (first?.role === "system") {
      scopedCtx.history = [{ role: "system", content: config.system }, ...rest];
    } else {
      scopedCtx.history = [{ role: "system", content: config.system }, ...scopedCtx.history];
    }
  }

  if (config.stream) {
    scopedCtx.stream = config.stream;
  }

  return scopedCtx;
};

export const scope = (
  config: ScopeConfig,
  ...steps: StepFunction[]
): StepFunction => {
  return async (ctx: ConversationContext): Promise<ConversationContext> => {
    let scopedCtx = scopeContext(config, ctx);

    if (config.until) {
      do {
        scopedCtx = await compose(...steps)(scopedCtx);
      } while (!config.until(scopedCtx));
    } else {
      scopedCtx = await compose(...steps)(scopedCtx);
    }

    return {
      ...ctx,
      history: config.silent ? ctx.history : scopedCtx.history,
      lastResponse: config.silent ? ctx.lastResponse : scopedCtx.lastResponse,
      lastRequest: config.silent ? ctx.lastRequest : scopedCtx.lastRequest,
      stopReason: config.silent ? ctx.stopReason : scopedCtx.stopReason,
      usage: scopedCtx.usage,
    };
  };
};
