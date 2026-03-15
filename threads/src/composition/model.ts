import { callProvider } from "../providers";
import { normalizeSchema } from "../schema";
import {
  ConversationContext,
  ToolCall,
  JsonSchema,
  StandardSchema,
  ComposedFunction,
} from "../types";
import { requestApproval } from "../approval";

export const model = ({
  model = "openai/gpt-4o-mini",
  schema,
  system,
  apiKey,
  baseUrl,
}: {
  model?: string;
  schema?: JsonSchema | StandardSchema;
  system?: string | ((ctx: ConversationContext) => string);
  apiKey?: string;
  baseUrl?: string;
} = {}): ComposedFunction => {
  return async (
    ctxOrMessage: ConversationContext | string,
  ): Promise<ConversationContext> => {
    const ctx =
      typeof ctxOrMessage === "string"
        ? // model()("hello!");
          {
            history: [{ role: "user" as const, content: ctxOrMessage }],
            tools: [],
          }
        : // model()(/* few shot or history */);
          ctxOrMessage;
    const normalizedSchema = schema ? normalizeSchema(schema) : undefined;

    let currentCtx = ctx;

    if (system) {
      const systemContent = typeof system === "function" ? system(currentCtx) : system;
      const [first, ...rest] = currentCtx.history;

      if (first?.role === "system") {
        currentCtx = {
          ...currentCtx,
          history: [{ role: "system", content: systemContent }, ...rest],
        };
      } else {
        currentCtx = {
          ...currentCtx,
          history: [{ role: "system", content: systemContent }, ...currentCtx.history],
        };
      }
    }

    const systemMessage = currentCtx.history.find((m) => m.role === "system");
    const instructions = systemMessage?.content;

    do {
      if (currentCtx.abortSignal?.aborted) {
        break;
      }

      currentCtx = await callProvider(
        { model, instructions, schema: normalizedSchema, apiKey, baseUrl },
        currentCtx,
      );

      if (currentCtx.lastResponse?.tool_calls && currentCtx.tools?.length) {
        currentCtx = await executeTools(currentCtx);
      }
    } while (
      currentCtx.lastResponse?.tool_calls &&
      currentCtx.tools?.length &&
      !currentCtx.abortSignal?.aborted
    );

    return currentCtx;
  };
};

const executeTools = async (
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const calls = ctx.lastResponse?.tool_calls || [];
  if (!calls.length) return ctx;

  if (ctx.stream) {
    ctx.stream({ type: "tool_calls_ready", calls });
  }

  const toolConfig = ctx.toolConfig || {};
  const {
    requireApproval = false,
    approvalCallback,
    parallel = false,
    retryCount = 0,
    approvalId,
    executeOnApproval = false,
  } = toolConfig;

  const updatedCounts = { ...(ctx.toolCallCounts || {}) };

  const runCall = async (call: ToolCall, approved: boolean) => {
    if (!approved) {
      if (ctx.stream) {
        ctx.stream({
          type: "tool_error",
          call,
          error: "Tool execution denied by user",
        });
      }
      return {
        call,
        result: { error: "Tool execution denied by user" },
      };
    }

    const toolName = call.function.name;
    const limits = ctx.toolLimits || {};
    const maxCalls = limits[toolName];
    const currentCount = updatedCounts[toolName] || 0;

    if (maxCalls && currentCount >= maxCalls) {
      const error = `Tool ${toolName} has reached its limit of ${maxCalls} calls`;
      if (ctx.stream) {
        ctx.stream({ type: "tool_error", call, error });
      }
      return {
        call,
        result: { error },
      };
    }

    updatedCounts[toolName] = currentCount + 1;

    if (ctx.stream) {
      ctx.stream({ type: "tool_executing", call });
    }

    let lastError: Error | undefined;
    for (let i = 0; i <= retryCount; i++) {
      try {
        const executor = ctx.toolExecutors?.[call.function.name];
        if (!executor) {
          throw new Error(`Tool executor not found: ${call.function.name}`);
        }
        let args = {};
        try {
          args = call.function.arguments
            ? JSON.parse(call.function.arguments)
            : {};
        } catch (e) {
          throw new Error(
            `Invalid JSON arguments for tool ${call.function.name}: ${call.function.arguments}`,
          );
        }
        const result = await executor(args);
        if (ctx.stream) {
          ctx.stream({ type: "tool_complete", call, result });
        }
        return { call, result };
      } catch (e) {
        lastError = e as Error;
      }
    }

    const error = lastError!.message;
    if (ctx.stream) {
      ctx.stream({ type: "tool_error", call, error });
    }
    return { call, result: { error } };
  };

  if (executeOnApproval && requireApproval) {
    const resultPromises = calls.map(async (call) => {
      let approved: boolean;

      if (approvalCallback) {
        approved = await approvalCallback(call);
      } else {
        const response = await requestApproval(call, approvalId);
        approved = response.approved;
      }

      return runCall(call, approved);
    });

    const results = await Promise.all(resultPromises);

    return {
      ...ctx,
      history: [
        ...ctx.history,
        ...results.map(({ call, result }) => ({
          role: "tool" as const,
          tool_call_id: call.id,
          content: JSON.stringify(result),
        })),
      ],
      toolCallCounts: updatedCounts,
    };
  }

  const approvalPromises = calls.map(async (call) => {
    if (requireApproval) {
      let approved: boolean;

      if (approvalCallback) {
        approved = await approvalCallback(call);
      } else {
        const response = await requestApproval(call, approvalId);
        approved = response.approved;
      }

      return { call, approved };
    } else {
      return { call, approved: true };
    }
  });

  const approvals = await Promise.all(approvalPromises);

  const runCallWithApproval = async (call: ToolCall) => {
    const approval = approvals.find((a) => a.call.id === call.id);
    return runCall(call, approval?.approved ?? true);
  };

  const results = parallel
    ? await Promise.all(calls.map(runCallWithApproval))
    : await runCallsSequentially(calls, runCallWithApproval);

  return {
    ...ctx,
    history: [
      ...ctx.history,
      ...results.map(({ call, result }) => ({
        role: "tool" as const,
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })),
    ],
    toolCallCounts: updatedCounts,
  };
};

const runCallsSequentially = async (
  calls: ToolCall[],
  runCall: (call: ToolCall) => Promise<{ call: ToolCall; result: any }>,
) => {
  const results: { call: ToolCall; result: any }[] = [];
  for (const call of calls) {
    results.push(await runCall(call));
  }
  return results;
};
