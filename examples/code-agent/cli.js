import readline from "readline";

export const createCli = (workflow, thread) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[36m>\x1b[0m ",
  });

  let currentLine = "";
  let pendingApprovals = [];
  let isFirstContent = true;
  let currentAbortController = null;
  let isProcessingMessage = false;

  const askApproval = (toolCall) => {
    return new Promise((resolve) => {
      pendingApprovals.push({ toolCall, resolve });
      if (pendingApprovals.length === 1) {
        processNextApproval();
      }
    });
  };

  const processNextApproval = () => {
    if (pendingApprovals.length === 0) return;

    const { toolCall, resolve } = pendingApprovals[0];
    const args = JSON.parse(toolCall.function.arguments);

    console.log("\n─────────────────────────────────────────────────");
    console.log(`Tool:   ${toolCall.function.name}`);

    if (args.description) {
      console.log(`Reason: ${args.description}`);
      const { description, ...otherArgs } = args;
      if (Object.keys(otherArgs).length > 0) {
        console.log(`Args:   ${JSON.stringify(otherArgs, null, 2)}`);
      }
    } else {
      console.log(`Args:   ${JSON.stringify(args, null, 2)}`);
    }

    console.log("─────────────────────────────────────────────────");

    rl.question("Approve? (y/n): ", (answer) => {
      const approved = answer.toLowerCase() === "y";
      resolve(approved);
      pendingApprovals.shift();

      if (pendingApprovals.length > 0) {
        processNextApproval();
      }
    });
  };

  const approvalCallback = async (toolCall) => {
    const dangerousTools = ["delete_file", "bash", "edit_file"];
    if (dangerousTools.some((name) => toolCall.function.name === name)) {
      return await askApproval(toolCall);
    }

    return true;
  };

  const handleStream = (event) => {
    switch (event.type) {
      case "content":
        if (isFirstContent) {
          process.stdout.write("* \x1b[32m");
          isFirstContent = false;
        }
        process.stdout.write(event.content);
        currentLine += event.content;
        if (currentLine.includes("\n")) currentLine = "";
        break;
      case "tool_calls_ready":
        process.stdout.write("\x1b[0m\x1b[33m");
        console.log(`\n[${event.calls.length} tool(s) pending]`);
        process.stdout.write("\x1b[0m\x1b[32m");
        break;
      case "tool_executing":
        process.stdout.write("\x1b[0m\x1b[33m");
        const args = JSON.parse(event.call.function.arguments);
        console.log(
          `[Executing ${event.call.function.name}(${JSON.stringify(args)})]`,
        );
        process.stdout.write("\x1b[0m\x1b[32m");
        break;
      case "tool_complete":
        process.stdout.write("\x1b[0m\x1b[33m");
        const result = event.result ? String(event.result) : "";
        if (result) {
          const lines = result.split("\n");
          if (lines.length > 8) {
            console.log(`[${event.call.function.name} completed]`);
            console.log(lines.slice(0, 8).join("\n"));
            console.log(`+${lines.length - 8} additional lines`);
          } else {
            console.log(`[${event.call.function.name} completed]`);
            console.log(result);
          }
        } else {
          console.log(`[${event.call.function.name} completed]`);
        }
        process.stdout.write("\x1b[0m\x1b[32m");
        break;
      case "tool_error":
        process.stdout.write("\x1b[0m\x1b[31m");
        console.log(`[${event.call.function.name} failed: ${event.error}]`);
        process.stdout.write("\x1b[0m\x1b[32m");
        break;
    }
  };

  const processMessage = async (message) => {
    try {
      isFirstContent = true;
      isProcessingMessage = true;
      currentAbortController = new AbortController();

      await thread.message(
        message,
        workflow(handleStream, approvalCallback, currentAbortController.signal),
      );

      process.stdout.write("\x1b[0m");
      console.log();
    } catch (error) {
      process.stdout.write("\x1b[0m");
      if (error.name === "AbortError") {
        console.log("\n[Canceled by user]");
      } else {
        console.error(`\nError: ${error.message}`);
      }
    } finally {
      currentAbortController = null;
      isProcessingMessage = false;
    }
    isFirstContent = true;
    rl.prompt();
  };

  process.stdin.on("data", (data) => {
    if (data[0] === 27 && currentAbortController && isProcessingMessage) {
      currentAbortController.abort();
    }
  });

  rl.on("line", (input) => {
    const message = input.trim();
    if (message) {
      processMessage(message);
    } else {
      rl.prompt();
    }
  });

  rl.on("close", () => {
    console.log();
    process.exit(0);
  });

  rl.prompt();
};
