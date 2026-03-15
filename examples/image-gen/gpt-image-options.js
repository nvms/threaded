import { generateImage } from "@threaded/ai";
import { writeFileSync } from "fs";

const prompt = "a floating golden crown with jewels";

const examples = [
  {
    name: "landscape-high-quality",
    options: { size: "1536x1024", quality: "high" },
    ext: "png",
  },
  {
    name: "portrait",
    options: { size: "1024x1536" },
    ext: "png",
  },
  {
    name: "jpeg-compressed",
    options: { outputFormat: "jpeg", outputCompression: 80 },
    ext: "jpg",
  },
  {
    name: "webp-transparent",
    options: { outputFormat: "webp", background: "transparent", quality: "high" },
    ext: "webp",
  },
];

console.log(`prompt: "${prompt}"\n`);

for (const { name, options, ext } of examples) {
  console.log(`generating ${name}...`);
  console.log(`  options: ${JSON.stringify(options)}`);

  const result = await generateImage("openai/gpt-image-1.5", prompt, options);

  const filename = `openai-gpt-image-1.5-${name}-output.${ext}`;
  const buffer = Buffer.from(result.data, "base64");
  writeFileSync(filename, buffer);

  console.log(`  saved to ${filename}`);
  console.log();
}

console.log("done");
