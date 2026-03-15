import { describe, it, expect } from "vitest";
import { z } from "zod";
import { model } from "../src/composition/model";
import { scope } from "../src/composition/scope";
import { compose } from "../src/composition/compose";
import { setKeys } from "../src/utils";
import { ToolConfig, Inherit } from "../src/types";

setKeys({ openai: process.env.OPENAI_API_KEY || "" });

const addTool: ToolConfig = {
  name: "add",
  description: "Add two numbers together",
  schema: {
    a: { type: "number", description: "First number" },
    b: { type: "number", description: "Second number" },
  },
  execute: async (args: { a: number; b: number }) => {
    return args.a + args.b;
  },
};

describe("model with real tool execution", () => {
  it("should call add tool and get correct result", async () => {
    const workflow = compose(
      scope(
        {
          tools: [addTool],
          inherit: Inherit.Conversation,
        },
        model({ model: "openai/gpt-4o-mini" }),
      ),
    );

    const result = await workflow("Please add 5 + 3 using the add tool");

    // console.log("conversation history:");
    // result.history.forEach((msg, i) => {
    //   if (msg.role === "assistant" && (msg as any).tool_calls) {
    //     console.log(
    //       `${i}: ${msg.role} - ${msg.content} [TOOL_CALLS: ${JSON.stringify((msg as any).tool_calls)}]`,
    //     );
    //   } else {
    //     console.log(`${i}: ${msg.role} - ${msg.content}`);
    //   }
    // });

    expect(result.history).toHaveLength(4); // user -> assistant with tool_call -> tool result -> assistant final
    expect(result.history[0].role).toBe("user");
    expect(result.history[1].role).toBe("assistant");
    expect(result.history[2].role).toBe("tool");
    expect(result.history[3].role).toBe("assistant");

    const toolResult = JSON.parse(result.history[2].content);
    expect(toolResult).toBe(8);

    expect(result.history[3].content.toLowerCase()).toContain("8");
  });

  it("should return JSON object matching zod schema", async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.email(),
    });

    const workflow = model({ model: "openai/gpt-4o-mini", schema });

    const result = await workflow(
      "Generate a person with name 'Alice', age 30, and email 'alice@example.com'",
    );

    // console.log("schema test conversation history:");
    // result.history.forEach((msg, i) => {
    //   console.log(`${i}: ${msg.role} - ${msg.content}`);
    // });

    expect(result.history).toHaveLength(2);
    expect(result.history[0].role).toBe("user");
    expect(result.history[1].role).toBe("assistant");

    const response = JSON.parse(result.history[1].content);

    expect(response).toHaveProperty("name");
    expect(response).toHaveProperty("age");
    expect(response).toHaveProperty("email");
    expect(typeof response.name).toBe("string");
    expect(typeof response.age).toBe("number");
    expect(typeof response.email).toBe("string");
    expect(response.email).toContain("@");
  });
});
