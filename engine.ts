import { evaluate } from "@marcbachmann/cel-js";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import type { ToolCall, AuditAction, Handler, Rule, RuleScope } from "./types.js";
import { defaultHandler } from "./handlers/default.js";

const SCOPE_ORDER: readonly RuleScope[] = ["session", "project", "global"];

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

  /** Get rule counts per scope. */
  getRuleCounts(): Record<RuleScope, number> {
    return {
      session: this.rules.session.length,
      project: this.rules.project.length,
      global: this.rules.global.length,
    };
  }

  /** Get all rules, grouped by scope. */
  getRules(): Record<RuleScope, Rule[]> {
    return this.rules;
  }

  /** Show all loaded rules in a styled custom UI. */
  async showRuleList(ctx: ExtensionCommandContext): Promise<void> {
    const hasRules = Object.values(this.rules).some((r) => r.length > 0);
    if (!hasRules) {
      ctx.ui.notify("No rules loaded.", "info");
      return;
    }

    const rules = this.rules;
    await ctx.ui.custom<void>((tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("text", theme.bold(" Auditor Rules")), 0, 0));
      container.addChild(new Text("", 0, 0));

      for (const scope of ["session", "project", "global"] as const) {
        const scopeRules = rules[scope];
        if (scopeRules.length === 0) continue;
        container.addChild(new Text(theme.fg("accent", `  ${scope}:`), 0, 0));
        for (const r of scopeRules) {
          const name = theme.fg("dim", r.name ?? "(unnamed)");
          const when = theme.fg("text", r.when ?? "(always)");
          const action =
            r.action.type === "accept"
              ? theme.fg("success", r.action.type)
              : r.action.type === "reject"
                ? theme.fg("error", r.action.type)
                : theme.fg("warning", r.action.type);
          container.addChild(new Text(`    ${name} ${when} \u2192 ${action}`, 0, 0));
        }
      }

      container.addChild(new Text("", 0, 0));
      container.addChild(new Text(theme.fg("dim", "  press any key to close"), 0, 0));
      const bottomBorder = new DynamicBorder((s: string) => theme.fg("accent", s));

      return {
        render(width: number): string[] {
          return [...container.render(width), ...bottomBorder.render(width)];
        },
        invalidate() {
          container.invalidate();
          bottomBorder.invalidate();
        },
        handleInput() {
          done(undefined);
          tui.requestRender();
        },
      };
    });
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
