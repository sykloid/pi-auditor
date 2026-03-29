import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ToolCall, Handler, VerifyResult } from "../types.js";

function summarize(toolCall: ToolCall): string {
  const parts = Object.entries(toolCall.input).map(([key, value]) => {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    return `  ${key}: ${str}`;
  });
  return parts.length > 0
    ? `${toolCall.toolName}:\n${parts.join("\n")}`
    : toolCall.toolName;
}

/**
 * Default handler for tools with no specific handler registered.
 * No enrichment — rules can only match on raw ToolCall fields.
 */
export const defaultHandler: Handler = {
  enrich(): void {},

  async verify(toolCall: ToolCall, ctx: ExtensionContext): Promise<VerifyResult> {
    const message = summarize(toolCall);
    const accepted = await ctx.ui.confirm(`Verify: ${toolCall.toolName}`, message);
    return { accepted };
  },
};
