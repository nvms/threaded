import { ConversationContext, Message, ProviderConfig } from "../types.js";
import { addUsage, getText } from "../utils.js";

const modelCache = new Map<string, any>();

const formatMessages = (instructions: string | undefined, history: Message[]) => {
  const messages: { role: string; content: string }[] = [];
  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }
  for (const msg of history) {
    messages.push({ role: msg.role, content: getText(msg.content) });
  }
  return messages;
};

export const callHuggingFace = async (
  config: ProviderConfig,
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const { model, instructions, schema } = config;

  const { pipeline } = await import("@huggingface/transformers");

  if (!modelCache.has(model)) {
    const generator = await pipeline("text-generation", model, {
      dtype: "q4",
    });
    modelCache.set(model, generator);
  }

  const generator = modelCache.get(model);
  const messages = formatMessages(instructions, ctx.history);

  if (schema) {
    const schemaMsg = messages.find((m) => m.role === "system");
    const schemaInstructions = [
      "you must respond with valid JSON matching this schema:",
      JSON.stringify(schema.schema, null, 2),
      "respond ONLY with the JSON object, no other text.",
    ].join("\n");

    if (schemaMsg) {
      schemaMsg.content += "\n\n" + schemaInstructions;
    } else {
      messages.unshift({ role: "system", content: schemaInstructions });
    }
  }

  const output = await generator(messages, {
    max_new_tokens: 2048,
    do_sample: false,
  });

  const generatedMessages = output[0].generated_text;
  const lastMessage = generatedMessages.at(-1);
  const content = lastMessage?.content || "";

  const msg: Message = {
    role: "assistant",
    content,
  };

  if (ctx.stream) {
    ctx.stream({ type: "content", content });
  }

  return {
    ...ctx,
    lastResponse: msg,
    history: [...ctx.history, msg],
    usage: addUsage(ctx.usage, 0, 0, 0),
  };
};
