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

setKeys({ openai: process.env.OPENAI_API_KEY });

const app = express();

const weatherTool = {
  name: "get_weather",
  description: "Get current weather for a city",
  schema: {
    city: {
      type: "string",
      description: "City name to get weather for",
    },
  },
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

  const workflow = compose(
    scope(
      {
        inherit: Inherit.All,
        system:
          "You are a helpful assistant. IMPORTANT: You DO NOT output text in Markdown format. Instead, you output plain, UNFORMATTED text.",
        tools: [weatherTool],
        toolConfig: {
          parallel: true,
        },
        stream: (event) => {
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
      compose(model({ model: "openai/gpt-4o-mini" })),
    ),
  );

  try {
    await thread.message(message, workflow);
    // const result = await workflow(message);
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

app.use(express.json());
app.post("/chat/:threadId", route);
app.use(express.static("public"));
app.get(/.*/, (_, res, __) =>
  res.sendFile(path.join(process.cwd(), "public", "index.html")),
);

app.listen(3005, () => {
  console.log("http://localhost:3005");
});
