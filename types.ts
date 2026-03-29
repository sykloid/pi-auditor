import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/** Rule scopes in order of specificity. */
export type RuleScope = "session" | "project" | "global";

/** Represents a tool call intercepted by the auditor. */
export interface ToolCall {
  toolName: string;
  toolCallId: string;
  cwd: string;
  input: Record<string, unknown>;
  /** Additional attributes populated by the handler during enrichment. */
  attributes: Record<string, unknown>;
}

/** An action that permits the tool call to proceed. */
export interface AcceptAction {
  type: "accept";
}

/** An action that rejects the tool call with a reason reported to the LLM. */
export interface RejectAction {
  type: "reject";
  reason: string;
}

/** An action that prompts the user to approve or deny the tool call. */
export interface VerifyAction {
  type: "verify";
  /** Why this tool call is being verified (which rule triggered it). */
  reason: string;
}

/** The set of actions that can be taken on an intercepted tool call. */
export type AuditAction = AcceptAction | RejectAction | VerifyAction;

/**
 * A rule pairs a CEL expression with an action.
 * The expression is evaluated against the ToolCall struct.
 * If the expression is omitted, the rule always matches.
 */
export interface Rule {
  /** Optional name for audit log readability. */
  name?: string;
  /** CEL expression evaluated against the ToolCall. Omit to match all. */
  when?: string;
  /** Action when matched. */
  action: AuditAction;
}

/** The result of a handler's verification flow. */
export interface VerifyResult {
  /** Whether the user accepted or rejected. */
  accepted: boolean;
  /** Optional new rule to register after verification. */
  newRule?: {
    rule: Rule;
    scope: RuleScope;
  };
}

/**
 * A handler for a specific tool (or class of tools).
 *
 * The handler enriches the tool call by populating its attributes dict,
 * then the engine evaluates rules via CEL against the enriched struct.
 * When verification is needed, the handler owns the full UI flow.
 */
export interface Handler {
  /** Populate toolCall.attributes with derived data. */
  enrich(toolCall: ToolCall): void;
  /** Conduct verification with the user. Called when a verify action is triggered. */
  verify(toolCall: ToolCall, ctx: ExtensionContext): Promise<VerifyResult>;
}
