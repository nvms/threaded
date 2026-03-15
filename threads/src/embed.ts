import { getKey } from "./utils";

const modelCache = new Map<string, any>();

/**
 * generates embeddings for text using openai or huggingface models
 *
 * openai models use the prefix "openai/" (e.g., "openai/text-embedding-3-small")
 * all other models use huggingface transformers
 *
 * accepts a single string or an array of strings for batch embedding
 *
 * @example
 * const vector = await embed("openai/text-embedding-3-small", "hello world");
 * const vectors = await embed("openai/text-embedding-3-small", ["hello", "world"]);
 */
export const embed = async (
  model: string,
  text: string | string[],
  config?: { dimensions?: number },
): Promise<number[] | number[][]> => {
  const isBatch = Array.isArray(text);

  if (model.startsWith("openai/")) {
    const modelName = model.replace("openai/", "");
    const apiKey = getKey("openai") || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OpenAI API key not found");
    }

    const body: any = {
      model: modelName,
      input: text,
    };

    if (config?.dimensions) {
      body.dimensions = config.dimensions;
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = (await response.json()) as any;

    if (isBatch) {
      return data.data.map((d: any) => d.embedding);
    }

    return data.data[0].embedding;
  }

  try {
    const { pipeline } = await import("@huggingface/transformers");

    if (!modelCache.has(model)) {
      const extractor = await pipeline("feature-extraction", model, {
        dtype: "fp32",
      });
      modelCache.set(model, extractor);
    }

    const extractor = modelCache.get(model);

    if (isBatch) {
      const results: number[][] = [];
      for (const t of text) {
        const result = await extractor(t, { pooling: "mean", normalize: true });
        results.push(Array.from(result.data) as number[]);
      }
      return results;
    }

    const result = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(result.data) as number[];
  } catch (error: any) {
    throw new Error(
      `huggingface transformers failed to load. install system dependencies or use openai models instead. original error: ${error.message}`,
    );
  }
};
