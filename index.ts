/**
 * Pi Auditor Extension
 *
 * Intercepts tool calls for rule-based evaluation and policy enforcement.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEventResult,
} from "@mariozechner/pi-coding-agent";
import type { ToolCall, AuditAction, Rule, RuleScope } from "./types.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { Auditor } from "./engine.js";
import { loadRules, appendRule } from "./config.js";
import { pathHandler } from "./handlers/path.js";

const REJECTION_MESSAGE =
  "User explicitly rejected this tool call. Do not attempt the same operation via a different tool or workaround. Report the intended change to the user instead.";

export default function (pi: ExtensionAPI) {
  const auditor = new Auditor();
  const rulePaths: Record<Exclude<RuleScope, "session">, string> = {
    project: "",
    global: join(homedir(), ".pi", "auditor", "rules.yml"),
  };

  // Serializes writes per scope to avoid concurrent file access.
  const writeQueues: Record<Exclude<RuleScope, "session">, Promise<void>> = {
    project: Promise.resolve(),
    global: Promise.resolve(),
  };

  function persistRule(scope: Exclude<RuleScope, "session">, rule: Rule): void {
    const path = rulePaths[scope];
    writeQueues[scope] = writeQueues[scope].then(() => {
      try {
        appendRule(path, rule);
      } catch {
        // Best-effort persistence — in-memory rule is already active.
      }
    });
  }

  async function executeAction(
    action: AuditAction,
    toolCall: ToolCall,
    ctx: ExtensionContext,
  ): Promise<ToolCallEventResult | undefined> {
    switch (action.type) {
      case "accept":
        return undefined;
      case "reject":
        return { block: true, reason: action.reason };
      case "verify": {
        if (!ctx.hasUI) {
          return { block: true, reason: "Blocked: no UI available for verification." };
        }

        const handler = auditor.getHandler(toolCall.toolName);
        const result = await handler.verify(toolCall, ctx);

        if (result.newRule) {
          const { scope, rule } = result.newRule;
          auditor.addRule(scope, rule);
          if (scope !== "session") {
            persistRule(scope, rule);
          }
        }

        if (!result.accepted) {
          const reason = result.message ?? REJECTION_MESSAGE;
          return { block: true, reason };
        }
        if (result.message) {
          pi.sendUserMessage(result.message, { deliverAs: "steer" });
        }
        return undefined;
      }
    }
  }

  // Register built-in handlers
  auditor.registerHandler("read", pathHandler("read"));
  auditor.registerHandler("write", pathHandler("write"));
  auditor.registerHandler("edit", pathHandler("edit"));

  pi.on("session_start", async (_event, ctx) => {
    rulePaths.project = join(ctx.cwd, ".pi", "auditor", "rules.yml");
    auditor.setRules("global", loadRules(rulePaths.global));
    auditor.setRules("project", loadRules(rulePaths.project));
    auditor.clearRules("session");
  });

  pi.on("tool_call", async (event, ctx) => {
    const toolCall: ToolCall = {
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      cwd: ctx.cwd,
      input: event.input as Record<string, unknown>,
      attributes: {},
    };

    const action = auditor.evaluate(toolCall);
    return executeAction(action, toolCall, ctx);
  });
}
