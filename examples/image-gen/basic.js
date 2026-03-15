import { generateImage } from "@threaded/ai";
import { writeFileSync } from "fs";

const prompt = process.argv[2] || "a cat wearing a tiny top hat, sitting in a vintage armchair";

console.log(`prompt: "${prompt}"\n`);

const result = await generateImage("openai/dall-e-3", prompt, {
  size: "1024x1024",
});

if (result.revisedPrompt) {
  console.log(`revised prompt: "${result.revisedPrompt}"\n`);
}

const buffer = Buffer.from(result.data, "base64");
writeFileSync("openai-dall-e-3-output.png", buffer);

console.log("saved to openai-dall-e-3-output.png");
