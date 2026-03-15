import {
  getOrCreateThread,
  model,
  compose,
  scope,
  setKeys,
  Inherit,
} from "@threaded/ai";
import express from "express";
import path from "path";
import { z } from "zod";

setKeys({
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GEMINI_API_KEY,
  xai: process.env.XAI_API_KEY,
});

const app = express();

const pendingApprovals = new Map();

const weatherTool = {
  name: "get_weather",
  description: "Get current weather for a city",
  schema: z.object({
    city: z.string().describe("City name to get weather for"),
  }),
  execute: async ({ city }) => {
    try {
      const response = await fetch(`https://wttr.in/${city}?format=j1`);
      const data = await response.json();
      const current = data.current_condition[0];
      return {
        city,
        temperature: `${current.temp_C}°C (${current.temp_F}°F)`,
        description: current.weatherDesc[0].value,
        humidity: `${current.humidity}%`,
        windSpeed: `${current.windspeedKmph} km/h`,
      };
    } catch (error) {
      return { error: `Could not fetch weather for ${city}` };
    }
  },
};

const route = async (req, res) => {
  const { threadId } = req.params;
  const { message } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const thread = getOrCreateThread(threadId);

  const approvalCallback = async (toolCall) => {
    return new Promise((resolve) => {
      const approvalId = `${threadId}-${toolCall.id}`;
      pendingApprovals.set(approvalId, { resolve, toolCall });

      res.write(
        `data: ${JSON.stringify({
          type: "tool_approval_required",
          call: toolCall,
          approvalId,
        })}\n\n`,
      );
    });
  };

  const workflow = compose(
    scope(
      {
        inherit: Inherit.All,
        system:
          "You are a helpful assistant. IMPORTANT: You DO NOT output text in Markdown format. Instead, you output plain, UNFORMATTED text.",
        tools: [weatherTool],
        toolConfig: {
          parallel: true,
          requireApproval: true,
          approvalCallback,
          executeOnApproval: false,
        },
        stream: (event) => {
          // console.log("event", event);
          switch (event.type) {
            case "content":
              res.write(
                `data: ${JSON.stringify({ type: "content", content: event.content })}\n\n`,
              );
              break;
            case "tool_calls_ready":
              res.write(
                `data: ${JSON.stringify({ type: "tool_calls_ready", calls: event.calls })}\n\n`,
              );
              break;
            case "tool_executing":
              res.write(
                `data: ${JSON.stringify({ type: "tool_executing", name: event.call.function.name, arguments: event.call.function.arguments })}\n\n`,
              );
              break;
            case "tool_complete":
              res.write(
                `data: ${JSON.stringify({ type: "tool_complete", name: event.call.function.name, result: event.result })}\n\n`,
              );
              break;
            case "tool_error":
              res.write(
                `data: ${JSON.stringify({ type: "tool_error", name: event.call.function.name, error: event.error })}\n\n`,
              );
              break;
          }
        },
      },
      // compose(model({ model: "anthropic/claude-sonnet-4-5-20250929" })),
      // compose(model({ model: "openai/gpt-4o-mini" })),
      compose(model({ model: "google/gemini-3-pro-preview" })),
      // compose(model({ model: "google/gemini-2.5-flash" })),
      // compose(model({ model: "xai/grok-4-1-fast-non-reasoning" })),
    ),
  );

  try {
    await thread.message(message, workflow);
    res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
    res.end();
  } catch (error) {
    console.error(error);

    res.write(
      `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`,
    );
    res.end();
  }
};

const approvalRoute = (req, res) => {
  const { approvalId } = req.params;
  const { approved } = req.body;

  const pending = pendingApprovals.get(approvalId);
  if (!pending) {
    return res.status(404).json({ error: "Approval not found" });
  }

  pendingApprovals.delete(approvalId);
  pending.resolve(approved);

  res.json({ success: true });
};

app.use(express.json());
app.post("/chat/:threadId", route);
app.post("/approve/:approvalId", approvalRoute);
app.use(express.static("public"));
app.get(/.*/, (_, res, __) =>
  res.sendFile(path.join(process.cwd(), "public", "index.html")),
);

app.listen(3006, () => {
  console.log("http://localhost:3006");
});
