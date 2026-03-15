#!/usr/bin/env node
import {
  compose,
  getOrCreateThread,
  Inherit,
  model,
  noToolsCalled,
  scope,
  setKeys,
} from "@threaded/ai";
import { getSystem, toolSystemMessage } from "./system.js";
import {
  task_add,
  task_remove,
  task_start,
  task_complete,
  read_file,
  write_file,
  edit_file,
  delete_file,
  list_directory,
  glob,
  grep,
  bash,
} from "./tools.js";
import { createCli } from "./cli.js";

setKeys({ openai: process.env.OPENAI_API_KEY });

const thread = getOrCreateThread("code-agent");

const createWorkflow = (streamHandler, approvalCallback, abortSignal) =>
  compose(
    scope(
      {
        inherit: Inherit.All,
        system: getSystem(),
        tools: [
          read_file,
          write_file,
          edit_file,
          delete_file,
          list_directory,
          glob,
          grep,
          bash,
        ],
        toolConfig: {
          requireApproval: true,
          approvalCallback,
        },
        stream: streamHandler,
        until: noToolsCalled(),
      },
      compose((ctx) =>
        // model("anthropic/claude-sonnet-4-5-20250929")({
        model("openai/gpt-4o-mini")({
          ...ctx,
          abortSignal,
        }),
      ),
    ),
  );

createCli(createWorkflow, thread);
