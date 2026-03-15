import { generateImage } from "@threaded/ai";
import { writeFileSync } from "fs";

const prompt = process.argv[2];
const model = process.argv[3] || "openai/gpt-image-1.5";

if (!prompt) {
  console.log("usage: node index.js <prompt> [model]");
  console.log("");
  console.log("models:");
  console.log("  openai/dall-e-3");
  console.log("  openai/gpt-image-1.5");
  console.log("  xai/grok-2-image-1212");
  console.log("  google/nano-banana-pro-preview");
  console.log("");
  console.log('example: node index.js "a cat in a hat" openai/dall-e-3');
  process.exit(1);
}

console.log(`model: ${model}`);
console.log(`prompt: "${prompt}"\n`);

const result = await generateImage(model, prompt);

if (result.revisedPrompt) {
  console.log(`revised prompt: "${result.revisedPrompt}"\n`);
}

const ext = model.includes("xai") ? "jpg" : "png";
const filename = `${model.replace("/", "-")}-output.${ext}`;
const buffer = Buffer.from(result.data, "base64");
writeFileSync(filename, buffer);

console.log(`saved to ${filename}`);
