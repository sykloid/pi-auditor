import { evaluate } from "@marcbachmann/cel-js";
import type { ToolCall, AuditAction, Handler, Rule, RuleScope } from "./types.js";
import { defaultHandler } from "./handlers/default.js";


const SCOPE_ORDER: RuleScope[] = ["session", "project", "global"];

/**
 * Evaluate a CEL expression against a ToolCall.
 * Returns true if the expression matches, or if no expression is given.
 */
function matchesRule(rule: Rule, toolCall: ToolCall): boolean {
  if (rule.when === undefined) return true;
  try {
    return evaluate(rule.when, toolCall) === true;
  } catch {
    // Malformed expression — fail closed (don't match)
    return false;
  }
}

/**
 * The auditor engine. Maintains a registry of tool name → handler,
 * and scoped rule lists evaluated via CEL.
 *
 * Rules are evaluated in scope order: session → project → global.
 * Within each scope, first match wins.
 */
export class Auditor {
  private handlers = new Map<string, Handler>();
  private rules: Record<RuleScope, Rule[]> = {
    session: [],
    project: [],
    global: [],
  };

  /** Register a handler for a tool name. */
  registerHandler(toolName: string, handler: Handler): void {
    this.handlers.set(toolName, handler);
  }

  /** Set rules for a scope. */
  setRules(scope: RuleScope, rules: Rule[]): void {
    this.rules[scope] = rules;
  }

  /** Prepend a rule to a scope. */
  addRule(scope: RuleScope, rule: Rule): void {
    this.rules[scope].unshift(rule);
  }

  /** Clear rules for a scope. */
  clearRules(scope: RuleScope): void {
    this.rules[scope] = [];
  }

  /** Get the handler for a tool (or the default). */
  getHandler(toolName: string): Handler {
    return this.handlers.get(toolName) ?? defaultHandler;
  }

  /** Evaluate a tool call and return the action to take. */
  evaluate(toolCall: ToolCall): AuditAction {
    const handler = this.getHandler(toolCall.toolName);

    // 1. Enrich
    handler.enrich(toolCall);

    // 2. Evaluate rules: session → project → global, first match wins
    for (const scope of SCOPE_ORDER) {
      for (const rule of this.rules[scope]) {
        if (matchesRule(rule, toolCall)) {
          return rule.action;
        }
      }
    }

    // 3. No match — default to verify
    return { type: "verify", reason: "" };
  }
}
