import { ImageConfig, ImageResult } from "./types";
import { getKey, parseModelName } from "./utils";

const providerKeyEnvVars: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
  google: "GEMINI_API_KEY",
};

const getApiKey = (provider: string): string => {
  try {
    return getKey(provider);
  } catch {
    const envVar = providerKeyEnvVars[provider];
    const key = envVar ? process.env[envVar] || "" : "";
    if (!key) throw new Error(`No API key found for provider: ${provider}`);
    return key;
  }
};

const generateOpenAICompatible = async (
  endpoint: string,
  modelName: string,
  prompt: string,
  apiKey: string,
  config?: ImageConfig,
): Promise<ImageResult> => {
  const isGptImage = modelName.startsWith("gpt-image");

  const body: Record<string, any> = {
    model: modelName,
    prompt,
  };

  if (!isGptImage) {
    body.response_format = config?.responseFormat || "b64_json";
  }

  if (config?.n) body.n = config.n;
  if (config?.size) body.size = config.size;
  if (config?.quality) body.quality = config.quality;
  if (config?.style && !isGptImage) body.style = config.style;

  if (isGptImage) {
    if (config?.outputFormat) body.output_format = config.outputFormat;
    if (config?.outputCompression != null) body.output_compression = config.outputCompression;
    if (config?.background) body.background = config.background;
    if (config?.moderation) body.moderation = config.moderation;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${error}`);
  }

  const data = (await response.json()) as any;
  const image = data.data[0];

  return {
    data: image.b64_json || image.url,
    revisedPrompt: image.revised_prompt,
  };
};

const generateGoogle = async (
  modelName: string,
  prompt: string,
  apiKey: string,
  config?: ImageConfig,
): Promise<ImageResult> => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const body: Record<string, any> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const imageConfig: Record<string, any> = {};
  if (config?.aspectRatio) imageConfig.aspectRatio = config.aspectRatio;
  if (config?.imageSize) imageConfig.imageSize = config.imageSize;

  if (Object.keys(imageConfig).length > 0) {
    body.generationConfig.imageConfig = imageConfig;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${error}`);
  }

  const data = (await response.json()) as any;
  const parts = data.candidates?.[0]?.content?.parts || [];

  const imagePart = parts.find((p: any) => p.inlineData);
  const textPart = parts.find((p: any) => p.text);

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    data: imagePart.inlineData.data,
    revisedPrompt: textPart?.text,
  };
};

export const generateImage = async (
  model: string,
  prompt: string,
  config?: ImageConfig,
): Promise<ImageResult> => {
  const { provider, model: modelName } = parseModelName(model);
  const providerLower = provider.toLowerCase();
  const apiKey = getApiKey(providerLower);

  switch (providerLower) {
    case "openai":
      return generateOpenAICompatible(
        "https://api.openai.com/v1/images/generations",
        modelName,
        prompt,
        apiKey,
        config,
      );

    case "xai":
      return generateOpenAICompatible(
        "https://api.x.ai/v1/images/generations",
        modelName,
        prompt,
        apiKey,
        config,
      );

    case "google":
      return generateGoogle(modelName, prompt, apiKey, config);

    default:
      throw new Error(`Unsupported image generation provider: ${provider}`);
  }
};
