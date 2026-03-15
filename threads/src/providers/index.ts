import { ConversationContext, ProviderConfig } from "../types";
import { parseModelName } from "../utils";
import { callOpenAI } from "./openai";
import { callAnthropic } from "./anthropic";
import { callGoogle } from "./google";
import { callHuggingFace } from "./huggingface";
import { callXAI } from "./xai";


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
