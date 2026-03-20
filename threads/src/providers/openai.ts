import { ConversationContext, Message, ProviderConfig } from "../types.js";
import { addUsage, getKey } from "../utils.js";

const getApiKey = (configApiKey?: string): string | undefined => {
  if (configApiKey) return configApiKey;
  try {
    return getKey("openai");
  } catch {
    return process.env.OPENAI_API_KEY || undefined;
  }
};

// openai streams tool calls as incremental chunks with index properties that need assembly
// example: {"index": 0, "function": {"name": "get_wea"}} then {"index": 0, "function": {"arguments": "ther"}}
// google/anthropic send complete tool calls in single chunks, so they don't need this logic
const appendToolCalls = (toolCalls: any[], tcchunklist: any[]): any[] => {
  for (const tcchunk of tcchunklist) {
    while (toolCalls.length <= tcchunk.index) {
      toolCalls.push({
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      });
    }
    const tc = toolCalls[tcchunk.index];
    tc.id += tcchunk.id || "";
    tc.function.name += tcchunk.function?.name || "";
    tc.function.arguments += tcchunk.function?.arguments || "";
  }
  return toolCalls;
};

export const callOpenAI = async (
  config: ProviderConfig,
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const { model, instructions, schema, apiKey: configApiKey, baseUrl } = config;
  const apiKey = getApiKey(configApiKey);
  const endpoint = baseUrl || "https://api.openai.com/v1";

  const messages = [];
  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }
  messages.push(...ctx.history);

  const body: any = {
    model,
    messages,
    stream: !!ctx.stream,
    ...(ctx.stream && { stream_options: { include_usage: true } }),
  };

  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: schema.name,
        schema: { ...schema.schema, additionalProperties: false },
        strict: true,
      },
    };
  }

  if (ctx.tools && ctx.tools.length > 0) {
    body.tools = ctx.tools;
    body.tool_choice = "auto";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: ctx.abortSignal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  if (ctx.stream) {
    return handleOpenAIStream(response, ctx);
  }
  const data = (await response.json()) as any;
  const choice = data.choices[0];
  const { message } = choice;

  const msg: Message & { tool_calls?: any[] } = {
    role: "assistant",
    content: message.content || "",
  };

  if (message.tool_calls) {
    msg.tool_calls = message.tool_calls;
  }

  return {
    ...ctx,
    lastResponse: msg,
    history: [...ctx.history, msg],
    usage: addUsage(ctx.usage, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, data.usage?.total_tokens || 0),
  };
};

const handleOpenAIStream = async (
  response: Response,
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let fullContent = "";
  let toolCalls: any[] = [];
  let buffer = "";
  let streamUsage: any = null;

  try {
    while (true) {
      if (ctx.abortSignal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.usage) {
              streamUsage = parsed.usage;
            }

            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;
              if (ctx.stream) {
                ctx.stream({ type: "content", content: delta.content });
              }
            }

            if (delta?.tool_calls) {
              toolCalls = appendToolCalls(toolCalls, delta.tool_calls);
              if (ctx.stream) {
                for (const tcchunk of delta.tool_calls) {
                  if (tcchunk.function?.arguments) {
                    const tc = toolCalls[tcchunk.index];
                    ctx.stream({
                      type: "tool_call_delta",
                      index: tcchunk.index,
                      name: tc?.function?.name || "",
                      argumentDelta: tcchunk.function.arguments,
                      argumentsSoFar: tc?.function?.arguments || "",
                    });
                  }
                  if (tcchunk.function?.name) {
                    ctx.stream({
                      type: "tool_call_start",
                      index: tcchunk.index,
                      name: toolCalls[tcchunk.index]?.function?.name || "",
                    });
                  }
                }
              }
            }
          } catch (e) {
            // skip invalid JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const msg: Message & { tool_calls?: any[] } = {
    role: "assistant",
    content: fullContent,
  };

  if (toolCalls.length > 0) {
    msg.tool_calls = toolCalls;
  }

  const usage = addUsage(ctx.usage, streamUsage?.prompt_tokens || 0, streamUsage?.completion_tokens || 0, streamUsage?.total_tokens || 0);

  if (ctx.stream && streamUsage) {
    ctx.stream({ type: "usage", usage });
  }

  return {
    ...ctx,
    lastResponse: msg,
    history: [...ctx.history, msg],
    usage,
  };
};
