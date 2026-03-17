import { ConversationContext, ProviderConfig } from "../types.js";
import { parseModelName } from "../utils.js";
import { callOpenAI } from "./openai.js";
import { callAnthropic } from "./anthropic.js";
import { callGoogle } from "./google.js";
import { callHuggingFace } from "./huggingface.js";
import { callXAI } from "./xai.js";


export const callProvider = async (
  config: ProviderConfig,
  ctx: ConversationContext,
): Promise<ConversationContext> => {
  const { provider, model } = parseModelName(config.model);
  const providerConfig = { ...config, model };

  switch (provider.toLowerCase()) {
    case "openai":
      return callOpenAI(providerConfig, ctx);
    case "anthropic":
      return callAnthropic(providerConfig, ctx);
    case "google":
      return callGoogle(providerConfig, ctx);
    case "xai":
      return callXAI(providerConfig, ctx);
    case "ollama":
      return callOpenAI({ ...providerConfig, baseUrl: providerConfig.baseUrl || "http://localhost:11434/v1" }, ctx);
    case "huggingface":
      return callHuggingFace(providerConfig, ctx);
    default:
      // unrecognized provider prefix - pass full model name for local inference
      return callHuggingFace({ ...config }, ctx);
  }
};
