import {
  Message,
  ConversationContext,
  StepFunction,
  ThreadStore,
  Thread,
} from "./types";
import { model } from "./composition/model";

const createMemoryStore = (): ThreadStore => {
  const store = new Map<string, Message[]>();

  return {
    async get(threadId: string): Promise<Message[]> {
      return store.get(threadId) || [];
    },

    async set(threadId: string, messages: Message[]): Promise<void> {
      store.set(threadId, messages);
    },
  };
};

const createThread = (id: string, store: ThreadStore): Thread => {
  return {
    id,
    store,
    async generate(workflow: StepFunction): Promise<ConversationContext> {
      const history = await store.get(id);

      const initialContext: ConversationContext = {
        history,
        tools: [],
        toolExecutors: {},
        toolLimits: {},
        toolCallCounts: {},
      };

      const finalContext = await workflow(initialContext);
      await store.set(id, finalContext.history);

      return finalContext;
    },
    async message(
      content: string,
      workflow?: StepFunction,
      options?: { abortSignal?: AbortSignal },
    ): Promise<ConversationContext> {
      const history = await store.get(id);
      const initialContext: ConversationContext = {
        history: [...history, { role: "user", content }],
        tools: [],
        toolExecutors: {},
        toolLimits: {},
        toolCallCounts: {},
        abortSignal: options?.abortSignal,
      };

      const finalContext = await (workflow || model())(initialContext);

      if (options?.abortSignal?.aborted) {
        const abortedHistory = [
          ...initialContext.history,
          { role: "assistant" as const, content: "[Response interrupted]" },
        ];
        await store.set(id, abortedHistory);
        return { ...finalContext, history: abortedHistory };
      }

      await store.set(id, finalContext.history);

      return finalContext;
    },
  };
};

const threads = new Map<string, Thread>();

/**
 * @example
 * // in-memory (default)
 * const thread = getOrCreateThread('user-123');
 *
 * @example
 * // sqlite
 * const thread = getOrCreateThread('user-123', {
 *   async get(id) {
 *     const row = await db.get('SELECT messages FROM threads WHERE id = ?', id);
 *     return row ? JSON.parse(row.messages) : [];
 *   },
 *   async set(id, messages) {
 *     await db.run(
 *       'INSERT OR REPLACE INTO threads (id, messages, updated_at) VALUES (?, ?, ?)',
 *       id,
 *       JSON.stringify(messages),
 *       Date.now()
 *     );
 *   }
 * });
 */
export const getOrCreateThread = (id: string, store?: ThreadStore): Thread => {
  const cacheKey = store ? `${id}-${store}` : id;

  if (threads.has(cacheKey)) {
    return threads.get(cacheKey)!;
  }

  const threadStore = store || createMemoryStore();
  const thread = createThread(id, threadStore);
  threads.set(cacheKey, thread);
  return thread;
};
