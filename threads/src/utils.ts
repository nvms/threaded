import {
  ApiKeys,
  ParsedModel,
  SchemaProperty,
  TokenUsage,
  ToolConfig,
  ToolDefinition,
} from "./types";
import { isStandardSchema, convertStandardSchemaToSchemaProperties } from "./schema";

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

export const addUsage = (
  existing: TokenUsage | undefined,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
): TokenUsage => ({
  promptTokens: (existing?.promptTokens || 0) + promptTokens,
  completionTokens: (existing?.completionTokens || 0) + completionTokens,
  totalTokens: (existing?.totalTokens || 0) + totalTokens,
});
