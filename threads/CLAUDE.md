# @threaded/ai

composable LLM inference library. provider-agnostic pipelines with tool execution, streaming, approval workflows, and usage tracking.

## structure

```
src/
  index.ts                  - public exports
  types.ts                  - all typescript interfaces
  thread.ts                 - persistent conversation threads
  schema.ts                 - JSON schema / Zod normalization
  approval.ts               - tool approval system (callback + event-driven)
  embed.ts                  - text embeddings (OpenAI + HuggingFace)
  image.ts                  - image generation (OpenAI, Google, xAI)
  image-model-schema.ts     - image model capabilities registry
  helpers.ts                - composition helpers (noToolsCalled, everyNMessages, etc.)
  utils.ts                  - key management, model name parsing, usage tracking
  mcp.ts                    - MCP tool integration
  examples.ts               - inline examples
  composition/
    compose.ts              - pipeline builder
    model.ts                - LLM inference + tool execution loop
    scope.ts                - isolated context with inheritance control
    when.ts                 - conditional execution
    tap.ts                  - side effects
    retry.ts                - retry wrapper
  providers/
    index.ts                - provider router
    anthropic.ts            - Anthropic Claude
    openai.ts               - OpenAI GPT
    google.ts               - Google Gemini
    xai.ts                  - xAI Grok
    local.ts                - Ollama (local)
    huggingface.ts          - HuggingFace Transformers (local)
  utils/
    rateLimited.ts          - token bucket rate limiter
tests/
```

## dev

```
make test      # run tests
make build     # compile typescript
```

## key concepts

- workflows are composed from steps: compose(scope({...}, model()), tap(...))
- each step receives a ConversationContext and returns a new one (immutable)
- scope() creates isolated contexts with bitwise inheritance (Conversation | Tools)
- model() calls the provider and auto-executes tool calls in a loop
- providers are selected by prefix: "openai/gpt-4o-mini", "anthropic/claude-sonnet-4-5-20250929"
- tools define schema + execute function, approval is opt-in per scope
- usage (tokens) propagates through nested scopes, even silent ones
- threads provide persistent conversation history with pluggable storage

## provider model strings

- openai/gpt-4o-mini, openai/gpt-4o, etc.
- anthropic/claude-sonnet-4-5-20250929, etc.
- google/gemini-2.0-flash, etc.
- xai/grok-3, etc.
- ollama/llama2
- HuggingFace/model-name (local transformers)

## testing

tests that call live APIs need API keys set via environment variables or setKeys().
keep test prompts short and use cheap models (gpt-4o-mini, gemini-2.0-flash) to minimize cost.
mock-based tests don't need keys.
