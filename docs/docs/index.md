---
hide:
  - navigation
---

# @threaded/ai

Composable LLM workflows for Node.js.

```bash
npm install @threaded/ai
```

## Core Principles

- Function composition over configuration
- Explicit conversation history management
- Built-in tool execution with approval flows
- Multi-provider support: OpenAI, Anthropic, Google, xAI, Ollama, HuggingFace
- Multimodal input (images, PDFs, audio) with provider-agnostic content parts
- Text embeddings and image generation

Workflows are functions that transform conversation context. Compose them together to build complex agentic behaviors from simple primitives.

## How It Works

1. Create a thread to manage conversation history
2. Define tools the model can call
3. Compose workflow steps (model calls, scopes, conditions)
4. Execute and stream results

Next: [Quick Start](quick-start.md)
