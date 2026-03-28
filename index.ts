/**
 * Pi Auditor Extension
 *
 * Intercepts tool calls for rule-based evaluation and policy enforcement.
 */

import type { ExtensionAPI, ToolCallEventResult } from "@mariozechner/pi-coding-agent";
import type { ToolCall, AuditAction, Handler } from "./types.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { Auditor } from "./engine.js";
import { loadRules } from "./config.js";
import { readHandler } from "./handlers/read.js";
import { writeHandler } from "./handlers/write.js";
import { editHandler } from "./handlers/edit.js";

/** Executes an audit action, returning a tool_call event result if the call should be blocked. */
async function executeAction(
  action: AuditAction,
  toolCall: ToolCall,
  handler: Handler,
  ctx: { ui: any; hasUI: boolean },
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

      // TODO: implement full verify UI
      const title = action.reason || `Verify: ${toolCall.toolName}`;
      const message = handler.summarize(toolCall);
      const approved = await ctx.ui.confirm(title, message);
      if (!approved) {
        return { block: true, reason: "User explicitly rejected this tool call. Do not attempt the same operation via a different tool or workaround. Report the intended change to the user instead." };
      }
      return undefined;
    }
  }
}

export default function (pi: ExtensionAPI) {
  const auditor = new Auditor();

  // Register built-in handlers
  auditor.registerHandler("read", readHandler);
  auditor.registerHandler("write", writeHandler);
  auditor.registerHandler("edit", editHandler);

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
    const handler = auditor.getHandler(toolCall.toolName);
    return executeAction(action, toolCall, handler, ctx);
  });
}
