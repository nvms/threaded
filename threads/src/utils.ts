import {
  ApiKeys,
  ContentPart,
  MediaSource,
  Message,
  ParsedModel,
  SchemaProperty,
  TokenUsage,
  ToolConfig,
  ToolDefinition,
} from "./types.js";
import { isStandardSchema, convertStandardSchemaToSchemaProperties } from "./schema.js";

export const toolConfigToToolDefinition = (
  tool: ToolConfig,
): ToolDefinition => {
  const schema = isStandardSchema(tool.schema)
    ? convertStandardSchemaToSchemaProperties(tool.schema)
    : tool.schema;

  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, prop] of Object.entries(schema)) {
    properties[key] = convertSchemaProperty(prop);
    if (!prop.optional) {
      required.push(key);
    }
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        ...(required.length > 0 && { required }),
      },
    },
  };
};

const convertSchemaProperty = (prop: SchemaProperty): any => {
  const result: any = {
    type: prop.type,
  };

  if (prop.description) {
    result.description = prop.description;
  }

  if (prop.enum) {
    result.enum = prop.enum;
  }

  if (prop.items) {
    result.items = convertSchemaProperty(prop.items);
  }

  if (prop.properties) {
    result.properties = {};
    for (const [key, childProp] of Object.entries(prop.properties)) {
      result.properties[key] = convertSchemaProperty(childProp);
    }
  }

  return result;
};

export const parseModelName = (model: string): ParsedModel => {
  const parts = model.split("/");

  if (parts.length === 1) {
    return { provider: "huggingface", model: parts[0] };
  }

  return {
    provider: parts[0],
    model: parts.slice(1).join("/"),
  };
};

let globalKeys: ApiKeys = {};

export const setKeys = (keys: ApiKeys): void => {
  globalKeys = { ...globalKeys, ...keys };
};

export const getKey = (provider: string): string => {
  const key = globalKeys[provider.toLowerCase()];
  if (!key) {
    throw new Error(`No API key configured for provider: ${provider}`);
  }
  return key;
};

export const maxCalls = (toolConfig: ToolConfig, maxCalls: number): ToolConfig => ({
  ...toolConfig,
  _maxCalls: maxCalls,
});

export const getText = (content: string | ContentPart[]): string => {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
};

export const message = (
  text: string,
  opts?: {
    images?: (MediaSource | string)[];
    documents?: ({ source: MediaSource; filename?: string } | MediaSource | string)[];
    audio?: MediaSource[];
  },
): Message => {
  const images = opts?.images || [];
  const documents = opts?.documents || [];
  const audio = opts?.audio || [];
  if (images.length === 0 && documents.length === 0 && audio.length === 0) {
    return { role: "user", content: text };
  }
  const parts: ContentPart[] = [{ type: "text", text }];
  for (const img of images) {
    if (typeof img === "string") {
      parts.push({ type: "image", source: { kind: "url", url: img } });
    } else {
      parts.push({ type: "image", source: img });
    }
  }
  for (const doc of documents) {
    if (typeof doc === "string") {
      parts.push({ type: "document", source: { kind: "url", url: doc } });
    } else if ("source" in doc) {
      parts.push({ type: "document", source: doc.source, filename: doc.filename });
    } else {
      parts.push({ type: "document", source: doc });
    }
  }
  for (const clip of audio) {
    parts.push({ type: "audio", source: clip });
  }
  return { role: "user", content: parts };
};

export const addUsage = (
  existing: TokenUsage | undefined,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  cachedTokens: number = 0,
): TokenUsage => ({
  promptTokens: (existing?.promptTokens || 0) + promptTokens,
  completionTokens: (existing?.completionTokens || 0) + completionTokens,
  totalTokens: (existing?.totalTokens || 0) + totalTokens,
  cachedTokens: (existing?.cachedTokens || 0) + cachedTokens,
});
