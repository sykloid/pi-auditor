/**
 * Pi Auditor Extension
 *
 * Intercepts tool calls for rule-based evaluation and policy enforcement.
 */

import type { ExtensionAPI, ExtensionContext, ToolCallEventResult } from "@mariozechner/pi-coding-agent";
import type { ToolCall, AuditAction } from "./types.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { Auditor } from "./engine.js";
import { loadRules } from "./config.js";
import { pathHandler } from "./handlers/path.js";

const REJECTION_MESSAGE = "User explicitly rejected this tool call. Do not attempt the same operation via a different tool or workaround. Report the intended change to the user instead.";

/** Executes an audit action, returning a tool_call event result if the call should be blocked. */
async function executeAction(
  action: AuditAction,
  toolCall: ToolCall,
  auditor: Auditor,
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
        auditor.addRule(result.newRule.scope, result.newRule.rule);
      }

      if (!result.accepted) {
        return { block: true, reason: REJECTION_MESSAGE };
      }
      return undefined;
    }
  }
}

export default function (pi: ExtensionAPI) {
  const auditor = new Auditor();

  // Register built-in handlers
  auditor.registerHandler("read", pathHandler("read"));
  auditor.registerHandler("write", pathHandler("write"));
  auditor.registerHandler("edit", pathHandler("edit"));

  pi.on("session_start", async (_event, ctx) => {
    auditor.setRules("global", loadRules(join(homedir(), ".pi", "auditor", "rules.yml")));
    auditor.setRules("project", loadRules(join(ctx.cwd, ".pi", "auditor", "rules.yml")));
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
    return executeAction(action, toolCall, auditor, ctx);
  });
}
