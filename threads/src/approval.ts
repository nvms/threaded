import { EventEmitter } from "events";
import { ToolCall } from "./types.js";

export interface ApprovalRequest {
  id: string;
  toolCall: ToolCall;
  approvalId?: string;
}

export interface ApprovalResponse {
  id: string;
  approved: boolean;
  reason?: string;
}

interface ApprovalManagerState {
  resolvers: Map<string, (response: ApprovalResponse) => void>;
  emitter: EventEmitter;
}

const state: ApprovalManagerState = {
  resolvers: new Map(),
  emitter: new EventEmitter(),
};

export const generateApprovalToken = (): string => {
  return `approval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const requestApproval = async (
  toolCall: ToolCall,
  approvalId?: string,
): Promise<ApprovalResponse> => {
  const id = generateApprovalToken();
  const request: ApprovalRequest = { id, toolCall, approvalId };

  state.emitter.emit("approvalRequested", request);

  return new Promise<ApprovalResponse>((resolve) => {
    state.resolvers.set(id, resolve);
  });
};

export const resolveApproval = (response: ApprovalResponse): boolean => {
  const resolver = state.resolvers.get(response.id);
  if (!resolver) return false;

  state.resolvers.delete(response.id);
  resolver(response);
  state.emitter.emit("approvalResolved", response);
  return true;
};

export const onApprovalRequested = (
  listener: (request: ApprovalRequest) => void,
) => {
  state.emitter.on("approvalRequested", listener);
};

export const onApprovalResolved = (
  listener: (response: ApprovalResponse) => void,
) => {
  state.emitter.on("approvalResolved", listener);
};

export const removeApprovalListener = (
  event: "approvalRequested" | "approvalResolved",
  listener: (...args: any[]) => void,
) => {
  state.emitter.removeListener(event, listener);
};
