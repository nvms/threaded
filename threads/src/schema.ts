import { JsonSchema, SchemaProperty, StandardSchema } from "./types.js";
import { z, type ZodType } from "zod";

export const isStandardSchema = (schema: any): schema is StandardSchema => {
  return schema && typeof schema === "object" && "~standard" in schema;
};

export const convertStandardSchemaToJsonSchema = (
  standardSchema: StandardSchema,
  name: string = "Schema",
): JsonSchema => {
  const jsonSchema = z.toJSONSchema(standardSchema as ZodType);
  return {
    name,
    schema: jsonSchema,
  };
};

export const convertMCPSchemaToToolSchema = (
  mcpSchema: any,
): Record<string, SchemaProperty> => {
  if (!mcpSchema?.properties) return {};

  const convertProperty = (prop: any): SchemaProperty => ({
    type: prop.type || "string",
    description: prop.description || "",
    ...(prop.enum && { enum: prop.enum }),
    ...(prop.items && { items: convertProperty(prop.items) }),
    ...(prop.properties && {
      properties: Object.fromEntries(
        Object.entries(prop.properties).map(([k, v]) => [k, convertProperty(v)])
      ),
    }),
  });

  const result: Record<string, SchemaProperty> = {};
  for (const [key, value] of Object.entries(mcpSchema.properties)) {
    const prop = value as any;
    result[key] = {
      ...convertProperty(prop),
      optional: !mcpSchema.required?.includes(key),
    };
  }
  return result;
};

export function normalizeSchema(
  schema: JsonSchema | StandardSchema,
  name?: string,
): JsonSchema {
  if (isStandardSchema(schema)) {
    return convertStandardSchemaToJsonSchema(schema, name);
  }
  return schema as JsonSchema;
}

export const convertStandardSchemaToSchemaProperties = (
  standardSchema: StandardSchema,
): Record<string, SchemaProperty> => {
  const jsonSchema = z.toJSONSchema(standardSchema as ZodType);
  return convertMCPSchemaToToolSchema(jsonSchema);
};
