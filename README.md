<p align="center">
  <img src=".github/logo.svg" width="80" height="80" alt="threads logo">
</p>

<h1 align="center">@threaded/ai</h1>

<p align="center">Composable LLM workflows for Node.js. Multi-provider support, tool execution, streaming, structured output, and approval workflows.</p>

## Installation

```bash
npm install @threaded/ai
```

## Quick Example

```js
import { compose, scope, model, setKeys } from "@threaded/ai"

setKeys({ openai: process.env.OPENAI_API_KEY })

const workflow = compose(
  scope({ tools: [searchTool] }, model({ model: "openai/gpt-4o-mini" }))
)

const result = await workflow("find recent papers on WebSockets")
console.log(result.lastResponse.content)
```

## Documentation

Full API docs, usage guides, and examples are in the [`threads/`](./threads) package and at the [docs site](https://nvms.github.io/threaded).

## Examples

Working examples are in the [`examples/`](./examples) directory.

## License

ISC
