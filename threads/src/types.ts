export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCallResult {
  name: string;
  inputs: any;
  results: any;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ToolConfig {
  name: string;
  description: string;
  schema: Record<string, SchemaProperty> | StandardSchema;
  execute: (args: any) => Promise<any> | any;
  _maxCalls?: number;
}

export interface SchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  optional?: boolean;
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
}

export interface ToolExecutionConfig {
  /** require user approval before executing tools */
  requireApproval?: boolean;
  /**
   * custom callback to handle tool approval, return true to approve
   * 
   * @example
   * // simple callback
   * approvalCallback: (call) => call.function.name !== 'dangerousTool'
   * 
   * @example
   * // event-driven (SSE): server sends approval request, waits for client POST
   * approvalCallback: (call) => new Promise((resolve) => {
   *   pendingApprovals.set(call.id, resolve);
   *   res.write(`data: ${JSON.stringify({ type: 'approval_needed', call })}\n\n`);
   * })
   * // then: app.post('/approve/:id', (req) => pendingApprovals.get(id)(req.body.approved))
   */
  approvalCallback?: (call: ToolCall) => boolean | Promise<boolean>;
  /** execute tools in parallel instead of sequentially */
  parallel?: boolean;
  /** number of times to retry failed tool executions */
  retryCount?: number;
  /** identifier for approval requests, useful for managing multiple approval flows */
  approvalId?: string;
  /** execute tools immediately upon approval instead of waiting for all approvals (default: false, only applies when requireApproval is true) */
  executeOnApproval?: boolean;
}

export type StreamEvent =
  | { type: 'content'; content: string }
  | { type: 'tool_call_start'; index: number; name: string }
  | { type: 'tool_call_delta'; index: number; name: string; argumentDelta: string; argumentsSoFar: string }
  | { type: 'tool_calls_ready'; calls: ToolCall[] }
  | { type: 'tool_executing'; call: ToolCall }
  | { type: 'tool_complete'; call: ToolCall; result: any }
  | { type: 'tool_error'; call: ToolCall; error: string }
  | { type: 'approval_requested'; call: ToolCall; requestId: string }
  | { type: 'usage'; usage: TokenUsage };

export interface ConversationContext {
  history: Message[];
  lastRequest?: Message;
  lastResponse?: Message & { tool_calls?: ToolCall[] };
  tools?: ToolDefinition[];
  toolExecutors?: Record<string, Function>;
  stream?: (event: StreamEvent) => void;
  stopReason?: string;

  toolCallCounts?: Record<string, number>;
  toolLimits?: Record<string, number>;
  toolConfig?: ToolExecutionConfig;
  abortSignal?: AbortSignal;
  usage?: TokenUsage;
}

export enum Inherit {
  Nothing = 0,
  Conversation = 1 << 0,
  Tools = 1 << 1,
  All = Conversation | Tools,
}

export interface ScopeConfig {
  inherit?: number;
  tools?: ToolConfig[];
  toolConfig?: ToolExecutionConfig;
  system?: string;
  silent?: boolean;
  until?: (ctx: ConversationContext) => boolean;
  stream?: (event: StreamEvent) => void;
}

export type StepFunction = (
  ctx: ConversationContext,
) => Promise<ConversationContext>;
export type ComposedFunction = (
  ctxOrMessage: ConversationContext | string,
) => Promise<ConversationContext>;

export interface JsonSchema {
  name: string;
  schema: Record<string, any>;
}

export interface StandardSchema {
  "~standard": any;
  [key: string]: any;
}

export interface ProviderConfig {
  model: string;
  instructions?: string;
  schema?: JsonSchema;
  apiKey?: string;
  baseUrl?: string;
}

export interface ParsedModel {
  provider: string;
  model: string;
}

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  [provider: string]: string | undefined;
}

export interface ThreadStore {
  get(threadId: string): Promise<Message[]>;
  set(threadId: string, messages: Message[]): Promise<void>;
}

export interface Thread {
  id: string;
  store: ThreadStore;
  generate(step: StepFunction): Promise<ConversationContext>;
  message(content: string, workflow?: StepFunction, options?: { abortSignal?: AbortSignal }): Promise<ConversationContext>;
}

export interface RetryOptions {
  times?: number;
}

export interface ImageConfig {
  n?: number;
  size?: string;
  quality?: "standard" | "hd" | "low" | "medium" | "high" | "auto";
  style?: "vivid" | "natural";
  responseFormat?: "url" | "b64_json";
  aspectRatio?: string;
  outputFormat?: "png" | "jpeg" | "webp";
  outputCompression?: number;
  background?: "transparent" | "opaque" | "auto";
  moderation?: "auto" | "low";
  imageSize?: "1K" | "2K";
}

export interface ImageResult {
  data: string;
  revisedPrompt?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}
