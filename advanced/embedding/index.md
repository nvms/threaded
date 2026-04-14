# Embeddings

Generate text embeddings.

## OpenAI Embeddings

```javascript
import { embed } from "@threaded/ai";

const vector = await embed("openai/text-embedding-3-small", "hello world");
```

Returns an array of numbers.

## With Dimensions

```javascript
const vector = await embed(
  "openai/text-embedding-3-small",
  "hello world",
  { dimensions: 256 }
);
```

Reduces output dimensions for smaller vectors.

## Hugging Face Models

```javascript
const vector = await embed("Xenova/all-MiniLM-L6-v2", "hello world");
```

Uses @huggingface/transformers for local inference.

Requires system dependencies (ONNX runtime).

## Semantic Search Example

```javascript
import { embed, cosineSimilarity } from "@threaded/ai";

const documents = [
  "the cat sat on the mat",
  "dogs are great pets",
  "javascript is a programming language",
];

const docVectors = await Promise.all(
  documents.map(doc => embed("openai/text-embedding-3-small", doc))
);

const queryVector = await embed("openai/text-embedding-3-small", "pets and animals");

const scores = docVectors
  .map((vec, i) => ({ document: documents[i], score: cosineSimilarity(queryVector, vec) }))
  .sort((a, b) => b.score - a.score);
```

Finds the most similar documents to a query.

## Caching

Hugging Face models are cached after first load.

```javascript
const vector1 = await embed("Xenova/all-MiniLM-L6-v2", "text 1");
const vector2 = await embed("Xenova/all-MiniLM-L6-v2", "text 2");
```

The second call reuses the loaded model.
