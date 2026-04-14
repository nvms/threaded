import { ProviderConfig, ContentPart, Message, ConversationContext } from "../types.js";
import { addUsage, getKey } from "../utils.js";

const toAnthropicUserContent = (content: string | ContentPart[]): any => {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image") {
      if (part.source.kind === "base64") {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: part.source.mediaType,
            data: part.source.data,
          },
        };
      }
      return { type: "image", source: { type: "url", url: part.source.url } };
    }
    if (part.type === "document") {
      if (part.source.kind === "base64") {
        return {
          type: "document",
          source: {
            type: "base64",
            media_type: part.source.mediaType,
            data: part.source.data,
          },
        };
      }
      return { type: "document", source: { type: "url", url: part.source.url } };
    }
    if (part.type === "audio") {
      throw new Error("Anthropic does not support audio input on the Messages API");
    }
    return part;
  });
};

const getApiKey = (configApiKey?: string): string => {
  if (configApiKey) return configApiKey;
  try {
    return getKey("anthropic");
  } catch {
    const key = process.env.ANTHROPIC_API_KEY || "";
    if (!key) throw new Error("Anthropic API key not found");
    return key;
  }
};

const convertToAnthropicFormat = (messages: any[]): any[] => {
  const result: any[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === "system") {
      i++;
      continue;
    }

    if (msg.role === "assistant") {
      if (msg.tool_calls) {
        result.push({
          role: "assistant",
          content: msg.tool_calls.map((tc: any) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          })),
        });
      } else {
        result.push({
          role: "assistant",
          content: msg.content,
        });
      }
      i++;
    } else if (msg.role === "tool") {
      const toolResults: any[] = [];
      while (i < messages.length && messages[i].role === "tool") {
        const toolMsg = messages[i];
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolMsg.tool_call_id,
          content: toolMsg.content,
        });
        i++;
      }
      result.push({
        role: "user",
        content: toolResults,
      });
    } else if (msg.role === "user") {
      result.push({ role: "user", content: toAnthropicUserContent(msg.content) });
      i++;
    } else {
      result.push(msg);
      i++;
    }
  }

  return result;
};

export const callAnthropic = async (
  config: ProviderConfig,
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const { model, instructions, schema, apiKey: configApiKey } = config;
  const apiKey = getApiKey(configApiKey);

  let system = instructions;

  if (ctx.history[0]?.role === "system") {
    const sc = ctx.history[0].content;
    system = typeof sc === "string" ? sc : undefined;
  }

  const messages = convertToAnthropicFormat(ctx.history);

  if (schema) {
    const schemaPrompt = `\n\nYou must respond with valid JSON that matches this schema:\n${JSON.stringify(
      schema.schema,
      null,
      2,
    )}\n\nReturn only the JSON object, no other text or formatting.`;
    system = system ? system + schemaPrompt : schemaPrompt.slice(2);
  }

  const body: any = {
    model,
    messages,
    max_tokens: 4096,
    stream: !!ctx.stream,
  };

  if (system) {
    body.system = system;
  }

  if (ctx.tools && ctx.tools.length > 0) {
    body.tools = ctx.tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: ctx.abortSignal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  if (ctx.stream) {
    return handleAnthropicStream(response, ctx);
  }
  const data = (await response.json()) as any;
  const content = data.content[0];

  const msg: Message & { tool_calls?: any[] } = {
    role: "assistant",
    content: content.type === "text" ? content.text : "",
  };

  if (content.type === "tool_use") {
    msg.tool_calls = [
      {
        id: content.id,
        type: "function",
        function: {
          name: content.name,
          arguments: JSON.stringify(content.input),
        },
      },
    ];
  }

  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const cachedTokens = data.usage?.cache_read_input_tokens || 0;

  return {
    ...ctx,
    lastResponse: msg,
    history: [...ctx.history, msg],
    usage: addUsage(ctx.usage, inputTokens, outputTokens, inputTokens + outputTokens, cachedTokens),
  };
};

const handleAnthropicStream = async (
  response: Response,
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let fullContent = "";
  const toolCalls: any[] = [];
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  try {
    while (true) {
      if (ctx.abortSignal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "message_start" && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens || 0;
              cachedTokens = parsed.message.usage.cache_read_input_tokens || 0;
            }

            if (parsed.type === "message_delta" && parsed.usage) {
              outputTokens = parsed.usage.output_tokens || 0;
            }

            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              fullContent += parsed.delta.text;
              if (ctx.stream) {
                ctx.stream({ type: 'content', content: parsed.delta.text });
              }
            }

            if (
              parsed.type === "content_block_start" &&
              parsed.content_block?.type === "tool_use"
            ) {
              const toolUse = parsed.content_block;
              toolCalls.push({
                id: toolUse.id,
                type: "function",
                function: {
                  name: toolUse.name,
                  arguments: "",
                },
                index: parsed.index,
              });
              if (ctx.stream) {
                ctx.stream({
                  type: "tool_call_start",
                  index: parsed.index,
                  name: toolUse.name,
                });
              }
            }

            if (
              parsed.type === "content_block_delta" &&
              parsed.delta?.type === "input_json_delta"
            ) {
              const toolCall = toolCalls.find((tc) => tc.index === parsed.index);
              if (toolCall) {
                toolCall.function.arguments += parsed.delta.partial_json;
                if (ctx.stream) {
                  ctx.stream({
                    type: "tool_call_delta",
                    index: parsed.index,
                    name: toolCall.function.name,
                    argumentDelta: parsed.delta.partial_json,
                    argumentsSoFar: toolCall.function.arguments,
                  });
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
    msg.tool_calls = toolCalls.map(({ index, ...tc }) => tc);
  }

  const usage = addUsage(ctx.usage, inputTokens, outputTokens, inputTokens + outputTokens, cachedTokens);

  if (ctx.stream && (inputTokens || outputTokens)) {
    ctx.stream({ type: "usage", usage });
  }

  return {
    ...ctx,
    lastResponse: msg,
    history: [...ctx.history, msg],
    usage,
  };
};
