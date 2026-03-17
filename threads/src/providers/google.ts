import { ConversationContext, Message, ProviderConfig } from "../types.js";
import { addUsage, getKey } from "../utils.js";

const getApiKey = (configApiKey?: string): string => {
  if (configApiKey) return configApiKey;
  try {
    return getKey("google");
  } catch {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
    if (!key) throw new Error("Google API key not found");
    return key;
  }
};

export const callGoogle = async (
  config: ProviderConfig,
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const { model, instructions, apiKey: configApiKey } = config;
  const apiKey = getApiKey(configApiKey);

  const contents = [];
  const toolCallMap = new Map<string, string>();

  for (let i = 0; i < ctx.history.length; i++) {
    const msg = ctx.history[i] as any;

    if (msg.role === "assistant") {
      const parts: any[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          toolCallMap.set(tc.id, tc.function.name);
          const part: any = {
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            },
          };
          if (tc.thoughtSignature) {
            part.thoughtSignature = tc.thoughtSignature;
          }
          parts.push(part);
        }
      }

      if (parts.length > 0) {
        contents.push({ role: "model", parts });
      }
    } else if (msg.role === "tool") {
      const responseParts: any[] = [];

      while (i < ctx.history.length && (ctx.history[i] as any).role === "tool") {
        const toolMsg = ctx.history[i] as any;
        const functionName = toolCallMap.get(toolMsg.tool_call_id);
        if (functionName) {
          let responseData;
          try {
            responseData = JSON.parse(toolMsg.content);
          } catch {
            responseData = { result: toolMsg.content };
          }
          if (Array.isArray(responseData)) {
            responseData = { result: responseData };
          }
          responseParts.push({
            functionResponse: {
              name: functionName,
              response: responseData,
            },
          });
        }
        i++;
      }
      i--;

      if (responseParts.length > 0) {
        contents.push({ role: "user", parts: responseParts });
      }
    } else if (msg.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  const body: any = { contents };

  if (instructions) {
    body.systemInstruction = {
      parts: [{ text: instructions }],
    };
  }

  if (ctx.tools && ctx.tools.length > 0) {
    body.tools = [
      {
        function_declarations: ctx.tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        })),
      },
    ];
  }

  const endpoint = ctx.stream ? "streamGenerateContent" : "generateContent";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}${ctx.stream ? '&alt=sse' : ''}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctx.abortSignal,
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${error}`);
  }

  if (ctx.stream) {
    return handleGoogleStream(response, ctx);
  }
  const data = (await response.json()) as any;
  const candidate = data.candidates[0];
  const parts = candidate.content.parts || [];

  const msg: Message & { tool_calls?: any[] } = {
    role: "assistant",
    content: "",
  };

  const toolCalls: any[] = [];

  for (const part of parts) {
    if (part.text) {
      msg.content += part.text;
    }
    if (part.functionCall) {
      const tc: any = {
        id: Math.random().toString(36).substring(2, 9),
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args),
        },
      };
      if (part.thoughtSignature) {
        tc.thoughtSignature = part.thoughtSignature;
      }
      toolCalls.push(tc);
    }
  }

  if (toolCalls.length > 0) {
    msg.tool_calls = toolCalls;
  }

  const um = data.usageMetadata;

  return {
    ...ctx,
    lastResponse: msg,
    history: [...ctx.history, msg],
    usage: addUsage(ctx.usage, um?.promptTokenCount || 0, um?.candidatesTokenCount || 0, um?.totalTokenCount || 0),
  };
};

const handleGoogleStream = async (
  response: Response,
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let fullContent = "";
  const toolCalls: any[] = [];
  let buffer = "";
  let usageMetadata: any = null;

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
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.usageMetadata) {
              usageMetadata = parsed.usageMetadata;
            }

            const candidate = parsed.candidates?.[0];
            const parts = candidate?.content?.parts || [];

            for (const part of parts) {
              if (part?.text) {
                fullContent += part.text;
                if (ctx.stream) {
                  ctx.stream({ type: 'content', content: part.text });
                }
              }

              if (part?.functionCall) {
                const tc: any = {
                  id: Math.random().toString(36).substring(2, 9),
                  type: "function",
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args),
                  },
                };
                if (part.thoughtSignature) {
                  tc.thoughtSignature = part.thoughtSignature;
                }
                toolCalls.push(tc);
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

  const um = usageMetadata;
  const usage = addUsage(ctx.usage, um?.promptTokenCount || 0, um?.candidatesTokenCount || 0, um?.totalTokenCount || 0);

  if (ctx.stream && um) {
    ctx.stream({ type: "usage", usage });
  }

  return {
    ...ctx,
    lastResponse: msg,
    history: [...ctx.history, msg],
    usage,
  };
};
