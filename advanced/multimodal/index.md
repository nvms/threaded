# Multimodal Input

Send images, PDFs, and audio alongside text in user messages. Each provider has a different wire format; `@threaded/ai` normalizes these into a single `ContentPart` vocabulary and translates per provider.

## The `message()` Helper

The easiest way to build a multimodal user message.

```typescript
import { compose, model, message } from "@threaded/ai";
import { readFileSync } from "fs";

const png = readFileSync("chart.png").toString("base64");

const userMessage = message("What's in this chart?", {
  images: [{ kind: "base64", mediaType: "image/png", data: png }],
});

const result = await compose(model({ model: "openai/gpt-4o-mini" }))({
  history: [userMessage],
});
```

`message()` returns a `Message` whose `content` is a `ContentPart[]`. Drop it directly into `ctx.history`.

### Image from URL

```typescript
const userMessage = message("Describe this photo.", {
  images: ["https://example.com/photo.jpg"],
});
```

A bare string in the `images` array is treated as a URL. Pass `{ kind, mediaType, data }` for base64.

### Multiple Images

```typescript
const userMessage = message("Compare these three charts.", {
  images: [
    { kind: "base64", mediaType: "image/png", data: pngA },
    { kind: "base64", mediaType: "image/png", data: pngB },
    "https://example.com/chart-c.png",
  ],
});
```

### PDF Documents

```typescript
const pdf = readFileSync("report.pdf").toString("base64");

const userMessage = message("Summarize this report.", {
  documents: [
    {
      source: { kind: "base64", mediaType: "application/pdf", data: pdf },
      filename: "report.pdf",
    },
  ],
});
```

`filename` is optional but useful — OpenAI in particular uses it as a display hint when the assistant references the file.

### Audio

```typescript
const wav = readFileSync("clip.wav").toString("base64");

const userMessage = message("Transcribe this clip.", {
  audio: [{ kind: "base64", mediaType: "audio/wav", data: wav }],
});
```

Audio input is only supported on audio-capable models (see the capability matrix below).

## Content Parts Directly

For finer control, build the `ContentPart[]` yourself instead of using `message()`.

```typescript
import { Message } from "@threaded/ai";

const userMessage: Message = {
  role: "user",
  content: [
    { type: "text", text: "What's in this image?" },
    {
      type: "image",
      source: { kind: "base64", mediaType: "image/png", data: png },
    },
  ],
};
```

The four part types.

```typescript
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: MediaSource }
  | { type: "document"; source: MediaSource; filename?: string }
  | { type: "audio"; source: MediaSource };

type MediaSource =
  | { kind: "base64"; mediaType: string; data: string }
  | { kind: "url"; url: string };
```

A message may contain any mix of text and media parts in any order. Assistant replies always come back as plain string content on the chat endpoints.

## Provider Capability Matrix

| Part     | OpenAI                                          | Anthropic     | Google     | xAI                   | Ollama                       |
| -------- | ----------------------------------------------- | ------------- | ---------- | --------------------- | ---------------------------- |
| image    | all vision models                               | all models    | all models | grok-2-vision, grok-4 | llava, llama3.2-vision, etc. |
| document | vision models (base64 PDF)                      | all models    | all models | not supported         | not supported                |
| audio    | gpt-4o-audio-preview, gpt-4o-mini-audio-preview | not supported | all models | not supported         | not supported                |

Unsupported combinations throw a clear error at the adapter boundary rather than silently dropping content. If you attach audio to a non-audio provider, the call raises instead of the model receiving only the text.

### Source Kind Compatibility

Not every provider accepts every source kind for every media type.

- **Images**: base64 and URL accepted on OpenAI, Anthropic, and xAI. Google accepts base64 directly and routes `kind: "url"` through its Files API (`file_data.file_uri`) — plain public URLs are not fetched by the Gemini server and should be uploaded first.
- **Documents**: base64 works everywhere that supports documents. URL works on Anthropic (native) and Google (via Files API). OpenAI requires base64 — for large PDFs, upload via the Files API and reference by `file_id` in a text message.
- **Audio**: base64 only, and only on providers in the matrix above.

## Running the Same Prompt Across Providers

Because the adapter layer hides the wire-format differences, the same `ContentPart[]` works across every multimodal provider.

```typescript
import { compose, model, message } from "@threaded/ai";

const userMessage = message("What color is this?", {
  images: [{ kind: "base64", mediaType: "image/png", data: png }],
});

const providers = [
  "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4-5",
  "google/gemini-2.5-flash-lite",
];

for (const provider of providers) {
  const result = await compose(model({ model: provider }))({
    history: [userMessage],
  });
  console.log(provider, "->", result.lastResponse?.content);
}
```

## PDF Example

```typescript
import { compose, model, message } from "@threaded/ai";
import { readFileSync } from "fs";

const pdf = readFileSync("invoice.pdf").toString("base64");

const result = await compose(model({ model: "openai/gpt-4o-mini" }))({
  history: [
    message("Extract the line items from this invoice as JSON.", {
      documents: [
        {
          source: { kind: "base64", mediaType: "application/pdf", data: pdf },
          filename: "invoice.pdf",
        },
      ],
    }),
  ],
});

console.log(result.lastResponse?.content);
```

Works identically against `google/gemini-2.5-flash` or `anthropic/claude-sonnet-4-5`.

## Audio Example

```typescript
import { compose, model, message } from "@threaded/ai";
import { readFileSync } from "fs";

const wav = readFileSync("meeting.wav").toString("base64");

const result = await compose(
  model({ model: "openai/gpt-4o-audio-preview" }),
)({
  history: [
    message("Transcribe this meeting and list the action items.", {
      audio: [{ kind: "base64", mediaType: "audio/wav", data: wav }],
    }),
  ],
});
```

When a message contains audio, the OpenAI adapter automatically adds `modalities: ["text"]` to the request body. Without that, the audio-preview models refuse to describe the input.

Supported audio formats on OpenAI: `audio/wav`, `audio/mp3`. Gemini accepts `audio/wav`, `audio/mpeg` (mp3), `audio/aiff`, `audio/aac`, `audio/ogg`, and `audio/flac`.

## Mixing Media and Tools

Multimodal input composes with tool execution the same way text does.

```typescript
import { compose, scope, model, message } from "@threaded/ai";

const saveNote = {
  name: "save_note",
  description: "Save a note to the database",
  schema: { text: { type: "string", description: "The note content" } },
  execute: async ({ text }) => ({ ok: true, text }),
};

const result = await compose(
  scope({ tools: [saveNote] }, model({ model: "openai/gpt-4o-mini" })),
)({
  history: [
    message("Read the sticky note in this photo, then save it.", {
      images: [{ kind: "base64", mediaType: "image/jpeg", data: jpeg }],
    }),
  ],
});
```

## Threads

Persistent threads work transparently with multimodal content — `thread.message()` only takes a string today, so use `thread.generate()` to push a pre-built multimodal message into history.

```typescript
import { getOrCreateThread, compose, model, message } from "@threaded/ai";

const thread = getOrCreateThread("user-42");

await thread.generate(async (ctx) => ({
  ...ctx,
  history: [
    ...ctx.history,
    message("What's in this chart?", {
      images: [{ kind: "base64", mediaType: "image/png", data: png }],
    }),
  ],
}));

await thread.generate(compose(model({ model: "openai/gpt-4o-mini" })));
```

History is persisted via the thread's store — the `ContentPart[]` survives JSON serialization cleanly.

## Error Handling

Unsupported combinations throw at call time, not later.

```typescript
try {
  await compose(model({ model: "xai/grok-4" }))({
    history: [
      message("What does this say?", {
        documents: [
          { source: { kind: "base64", mediaType: "application/pdf", data: pdf } },
        ],
      }),
    ],
  });
} catch (err) {
  // "xAI does not support document/PDF input on the chat completions API"
}
```

Catch at the composition boundary and retry against a provider that supports the media type.
