export interface ConfigOption {
  values: string[];
  default: string;
  description: string;
}

export interface ModelConfig {
  [option: string]: ConfigOption;
}

export interface ProviderModels {
  [model: string]: ModelConfig;
}

export interface ImageModelSchema {
  [provider: string]: ProviderModels;
}

export const IMAGE_MODEL_SCHEMA: ImageModelSchema = {
  openai: {
    "dall-e-3": {
      size: {
        values: ["1024x1024", "1024x1792", "1792x1024"],
        default: "1024x1024",
        description: "Image dimensions",
      },
      quality: {
        values: ["standard", "hd"],
        default: "standard",
        description: "Image quality level",
      },
      style: {
        values: ["vivid", "natural"],
        default: "vivid",
        description: "Image style",
      },
    },
    "gpt-image-1.5": {
      size: {
        values: ["1024x1024", "1536x1024", "1024x1536", "auto"],
        default: "auto",
        description: "Image dimensions",
      },
      quality: {
        values: ["low", "medium", "high", "auto"],
        default: "auto",
        description: "Image quality level",
      },
      background: {
        values: ["transparent", "opaque", "auto"],
        default: "auto",
        description: "Background type",
      },
      moderation: {
        values: ["auto", "low"],
        default: "auto",
        description: "Content moderation level",
      },
    },
  },
  google: {
    "gemini-2.5-flash-image": {
      aspectRatio: {
        values: ["1:1", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
        description: "Image aspect ratio",
      },
    },
    "gemini-3-pro-image-preview": {
      aspectRatio: {
        values: ["1:1", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
        description: "Image aspect ratio",
      },
      imageSize: {
        values: ["1K", "2K"],
        default: "1K",
        description: "Output image size",
      },
    },
  },
  xai: {},
};

export const IMAGE_EDIT_MODEL_SCHEMA: ImageModelSchema = {
  openai: {
    "gpt-image-1.5": {
      size: {
        values: ["1024x1024", "1536x1024", "1024x1536", "auto"],
        default: "auto",
        description: "Output image size",
      },
      quality: {
        values: ["low", "medium", "high", "auto"],
        default: "auto",
        description: "Image quality level",
      },
      background: {
        values: ["transparent", "opaque", "auto"],
        default: "auto",
        description: "Background type",
      },
    },
  },
  google: {
    "gemini-3-pro-image-preview": {},
  },
};

export function getModelConfig(provider: string, model: string): ModelConfig | null {
  return IMAGE_MODEL_SCHEMA[provider]?.[model] || null;
}

export function getDefaultConfig(provider: string, model: string): Record<string, string> {
  const schema = getModelConfig(provider, model);
  if (!schema) return {};
  const defaults: Record<string, string> = {};
  for (const [key, option] of Object.entries(schema)) {
    defaults[key] = option.default;
  }
  return defaults;
}
