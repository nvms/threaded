# Image Generation

Generate images from text prompts.

## Basic Usage

```typescript
import { generateImage } from "@threaded/ai";

const result = await generateImage(
  "openai/dall-e-3",
  "a cat wearing a tiny top hat"
);

const buffer = Buffer.from(result.data, "base64");
writeFileSync("output.png", buffer);
```

Returns `{ data: string, revisedPrompt?: string }`.

- `data` - Base64-encoded image data (or URL if requested).
- `revisedPrompt` - The prompt actually used by the model. Some providers revise your prompt before generating.

## Supported Providers

### OpenAI

DALL-E and GPT-image models.

```typescript
await generateImage("openai/dall-e-3", "a sunset over mountains");
await generateImage("openai/dall-e-2", "a sunset over mountains");
await generateImage("openai/gpt-image-1.5", "a sunset over mountains");
```

### xAI (Grok)

```typescript
await generateImage("xai/grok-2-image-1212", "a sunset over mountains");
```

Returns JPEG format.

### Google (Gemini)

```typescript
await generateImage("google/gemini-2.5-flash-image", "a sunset over mountains");
await generateImage("google/nano-banana-pro-preview", "a sunset over mountains");
```

## Configuration Options

Pass options as the third argument.

```typescript
await generateImage("openai/dall-e-3", "prompt", {
  size: "1024x1024",
  quality: "hd",
  style: "vivid",
});
```

### Common Options

| option | type | description |
|--------|------|-------------|
| `n` | number | number of images to generate (1-10) |
| `size` | string | image dimensions |
| `quality` | string | generation quality |
| `responseFormat` | string | `"url"` or `"b64_json"` |

### DALL-E Options

| option | values |
|--------|--------|
| `size` | `"256x256"`, `"512x512"`, `"1024x1024"` (dall-e-2) |
| | `"1024x1024"`, `"1792x1024"`, `"1024x1792"` (dall-e-3) |
| `quality` | `"standard"`, `"hd"` |
| `style` | `"vivid"`, `"natural"` |

### GPT-Image Options

Models: gpt-image-1, gpt-image-1.5, gpt-image-1-mini.

| option | values |
|--------|--------|
| `size` | `"1024x1024"`, `"1536x1024"`, `"1024x1536"`, `"auto"` |
| `quality` | `"low"`, `"medium"`, `"high"`, `"auto"` |
| `outputFormat` | `"png"`, `"jpeg"`, `"webp"` |
| `outputCompression` | 0-100 (jpeg/webp only) |
| `background` | `"transparent"`, `"opaque"`, `"auto"` |

```typescript
await generateImage("openai/gpt-image-1.5", "a golden crown", {
  size: "1536x1024",
  quality: "high",
  outputFormat: "webp",
  background: "transparent",
});
```

Transparent backgrounds require PNG or WebP format.

### Google Options

| option | values |
|--------|--------|
| `aspectRatio` | `"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"` |

```typescript
await generateImage("google/gemini-2.5-flash-image", "a landscape", {
  aspectRatio: "16:9",
});
```

## Revised Prompts

Some providers (OpenAI, xAI) revise your prompt before generating.

```typescript
const result = await generateImage(
  "xai/grok-2-image-1212",
  "a cat in a hat"
);

console.log(result.revisedPrompt);
// "A high-resolution photograph of a gray and white cat
//  wearing a small black top hat, sitting in a plush,
//  red velvet vintage armchair..."
```

This is useful for understanding what the model actually generated.

## Saving Images

### As File

```typescript
import { writeFileSync } from "fs";

const result = await generateImage("openai/gpt-image-1.5", "prompt");
const buffer = Buffer.from(result.data, "base64");
writeFileSync("output.png", buffer);
```

### Compressed JPEG

```typescript
const result = await generateImage("openai/gpt-image-1.5", "prompt", {
  outputFormat: "jpeg",
  outputCompression: 80,
});

const buffer = Buffer.from(result.data, "base64");
writeFileSync("output.jpg", buffer);
```

Produces a smaller file size with faster generation.

## API Keys

Environment variables are detected automatically.

| provider | env var |
|----------|---------|
| openai | `OPENAI_API_KEY` |
| xai | `XAI_API_KEY` |
| google | `GEMINI_API_KEY` |

Or use `setKeys()` - see [quick start](../quick-start.md#api-keys).

## Complete Example

```typescript
import { generateImage } from "@threaded/ai";
import { writeFileSync } from "fs";

const providers = [
  { model: "openai/gpt-image-1.5", ext: "png" },
  { model: "xai/grok-2-image-1212", ext: "jpg" },
  { model: "google/nano-banana-pro-preview", ext: "png" },
];

const prompt = "a robot playing chess with a penguin";

for (const { model, ext } of providers) {
  const result = await generateImage(model, prompt);

  const buffer = Buffer.from(result.data, "base64");
  const filename = model.replace("/", "-") + "." + ext;
  writeFileSync(filename, buffer);

  console.log(`${model}: saved to ${filename}`);
  if (result.revisedPrompt) {
    console.log(`  revised: ${result.revisedPrompt.slice(0, 100)}...`);
  }
}
```

Generates the same prompt across multiple providers for comparison.
