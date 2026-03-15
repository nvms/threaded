import { compose } from "./composition/compose";
import { model } from "./composition/model";
import { scope } from "./composition/scope";
import { appendToLastRequest, everyNMessages, noToolsCalled } from "./helpers";

const workflow = compose(
  everyNMessages(30, appendToLastRequest("stay focused")),
  scope({ tools: [], until: noToolsCalled() }, model({ model: "openai/gpt-4" })),
  scope({ tools: [], until: noToolsCalled() }, model({ model: "anthropic/sonnet" })),
);
