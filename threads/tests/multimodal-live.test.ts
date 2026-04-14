import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { compose } from "../src/composition/compose";
import { model } from "../src/composition/model";
import { setKeys, message } from "../src/utils";
import { ConversationContext } from "../src/types";

const makeSolidRgbPng = (
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): string => {
  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * rowLen + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const idat = zlib.deflateSync(raw);

  const chunk = (type: string, data: Buffer): Buffer => {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
};

const makeTextPdf = (text: string): string => {
  const streamBody = `BT /F1 48 Tf 100 700 Td (${text}) Tj ET`;
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  const header = "%PDF-1.4\n";
  let body = "";
  const offsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(header.length + body.length);
    body += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = header.length + body.length;

  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, "binary").toString("base64");
};

const makeToneWav = (freqHz: number, seconds: number): string => {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * seconds);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;

  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * freqHz * t) * 16384);
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf.toString("base64");
};

setKeys({
  openai: process.env.OPENAI_API_KEY || "",
  google: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
});

const redPng = makeSolidRgbPng(32, 32, 255, 0, 0);
const greenPng = makeSolidRgbPng(32, 32, 0, 200, 0);
const foxbatPdf = makeTextPdf("FOXBAT");
const toneWav = makeToneWav(440, 1);

const askColor = (img: string) =>
  message(
    "What single color fills this image? Answer with just one word: red, green, or blue.",
    { images: [{ kind: "base64", mediaType: "image/png", data: img }] },
  );

const runSingleColor = async (modelName: string, img: string): Promise<ConversationContext> => {
  const ctx: ConversationContext = { history: [askColor(img)] };
  return compose(model({ model: modelName }))(ctx);
};

const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);

describe.skipIf(!hasOpenAI)("multimodal: openai/gpt-4o-mini", () => {
  it("identifies a red image", async () => {
    const result = await runSingleColor("openai/gpt-4o-mini", redPng);
    const text = (result.lastResponse?.content as string).toLowerCase();
    expect(text).toContain("red");
  }, 30_000);

  it("identifies a green image", async () => {
    const result = await runSingleColor("openai/gpt-4o-mini", greenPng);
    const text = (result.lastResponse?.content as string).toLowerCase();
    expect(text).toContain("green");
  }, 30_000);
});

describe.skipIf(!hasGemini)("multimodal: google/gemini-2.5-flash-lite", () => {
  it("identifies a red image", async () => {
    const result = await runSingleColor("google/gemini-2.5-flash-lite", redPng);
    const text = (result.lastResponse?.content as string).toLowerCase();
    expect(text).toContain("red");
  }, 30_000);

  it("identifies a green image", async () => {
    const result = await runSingleColor("google/gemini-2.5-flash-lite", greenPng);
    const text = (result.lastResponse?.content as string).toLowerCase();
    expect(text).toContain("green");
  }, 30_000);
});

const askPdfWord = () =>
  message(
    "What single English word appears in this PDF? Reply with just that word, uppercase, nothing else.",
    {
      documents: [
        {
          source: { kind: "base64", mediaType: "application/pdf", data: foxbatPdf },
          filename: "foxbat.pdf",
        },
      ],
    },
  );

describe.skipIf(!hasOpenAI)("multimodal pdf: openai/gpt-4o-mini", () => {
  it("extracts FOXBAT from a generated PDF", async () => {
    const ctx: ConversationContext = { history: [askPdfWord()] };
    const result = await compose(model({ model: "openai/gpt-4o-mini" }))(ctx);
    const text = (result.lastResponse?.content as string).toUpperCase();
    expect(text).toContain("FOXBAT");
  }, 60_000);
});

describe.skipIf(!hasGemini)("multimodal pdf: google/gemini-2.5-flash-lite", () => {
  it("extracts FOXBAT from a generated PDF", async () => {
    const ctx: ConversationContext = { history: [askPdfWord()] };
    const result = await compose(model({ model: "google/gemini-2.5-flash-lite" }))(ctx);
    const text = (result.lastResponse?.content as string).toUpperCase();
    expect(text).toContain("FOXBAT");
  }, 60_000);
});

const askAudioBinary = () =>
  message(
    "Listen to the attached audio. Which of these does it sound most like? Reply with exactly one letter, A or B, and nothing else.\nA) a phone ringing\nB) a dog barking",
    { audio: [{ kind: "base64", mediaType: "audio/wav", data: toneWav }] },
  );

const pickedPhoneRinging = (text: string): boolean => {
  const trimmed = text.trim().toUpperCase();
  return trimmed.startsWith("A");
};

describe.skipIf(!hasGemini)("multimodal audio: google/gemini-2.5-flash", () => {
  it("picks 'phone ringing' over 'dog barking' for a 440Hz tone", async () => {
    const ctx: ConversationContext = { history: [askAudioBinary()] };
    const result = await compose(model({ model: "google/gemini-2.5-flash" }))(ctx);
    const text = result.lastResponse?.content as string;
    expect(pickedPhoneRinging(text)).toBe(true);
  }, 60_000);
});

describe.skipIf(!hasOpenAI)("multimodal audio: openai/gpt-4o-audio-preview", () => {
  // audio-preview models hallucinate freely on synthetic audio (a 1kHz sine wave gets
  // described as "crowd cheering" half the time), so no content-level assertion is stable.
  // proving the adapter shipped audio bytes is what actually matters here: compare
  // promptTokens against a text-only baseline on gpt-4o-mini (same o200k tokenizer,
  // gpt-4o-audio-preview itself refuses text-only requests). audio inflates the count
  // deterministically.
  it("reports more prompt tokens when audio is attached than text-only baseline", async () => {
    const prompt = "Describe this audio in one short phrase.";
    const withAudioCtx: ConversationContext = {
      history: [
        message(prompt, {
          audio: [{ kind: "base64", mediaType: "audio/wav", data: toneWav }],
        }),
      ],
    };
    const textOnlyCtx: ConversationContext = {
      history: [{ role: "user", content: prompt }],
    };

    const [a, b] = await Promise.all([
      compose(model({ model: "openai/gpt-4o-audio-preview" }))(withAudioCtx),
      compose(model({ model: "openai/gpt-4o-mini" }))(textOnlyCtx),
    ]);

    const audioTokens = a.usage?.promptTokens ?? 0;
    const textOnlyTokens = b.usage?.promptTokens ?? 0;
    expect(audioTokens).toBeGreaterThan(textOnlyTokens);
  }, 60_000);
});
