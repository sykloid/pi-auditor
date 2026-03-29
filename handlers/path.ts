import { resolve, relative } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ToolCall, Handler, VerifyResult } from "../types.js";

/**
 * Create a handler for a path-based tool (read, write, edit).
 *
 * Attributes added:
 *   - absolutePath: fully resolved path
 *   - relativePath: path relative to cwd
 */
export function pathHandler(toolName: string): Handler {
  return {
    enrich(toolCall: ToolCall): void {
      const rawPath = (toolCall.input.path as string) ?? "";
      toolCall.attributes.absolutePath = resolve(toolCall.cwd, rawPath);
      toolCall.attributes.relativePath = relative(
        toolCall.cwd,
        toolCall.attributes.absolutePath as string,
      );
    },

    async verify(toolCall: ToolCall, ctx: ExtensionContext): Promise<VerifyResult> {
      const message = `${toolName}: ${toolCall.attributes.relativePath}`;
      const accepted = await ctx.ui.confirm(`Verify: ${toolName}`, message);
      return { accepted };
    },
  };
}
