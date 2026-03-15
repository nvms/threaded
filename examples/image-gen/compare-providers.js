import { generateImage } from "@threaded/ai";
import { writeFileSync } from "fs";

const prompt = process.argv[2] || "a cat wearing a tiny top hat, sitting in a vintage armchair";

const providers = [
  { model: "openai/dall-e-3", ext: "png", options: { size: "1024x1024" } },
  { model: "openai/gpt-image-1.5", ext: "png", options: { quality: "high" } },
  { model: "xai/grok-2-image-1212", ext: "jpg", options: {} },
  { model: "google/nano-banana-pro-preview", ext: "png", options: {} },
];

console.log(`prompt: "${prompt}"\n`);

for (const { model, ext, options } of providers) {
  console.log(`generating with ${model}...`);

  const result = await generateImage(model, prompt, options);

  const filename = `${model.replace("/", "-")}-output.${ext}`;
  const buffer = Buffer.from(result.data, "base64");
  writeFileSync(filename, buffer);

  console.log(`  saved to ${filename}`);

  if (result.revisedPrompt) {
    console.log(`  revised: "${result.revisedPrompt.slice(0, 80)}..."`);
  }

  console.log();
}

console.log("done");
