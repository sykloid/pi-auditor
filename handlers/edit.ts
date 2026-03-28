import { resolve, relative } from "node:path";
import type { ToolCall, Handler } from "../types.js";

/**
 * Handler for the built-in edit tool.
 *
 * Attributes added:
 *   - absolutePath: fully resolved path
 *   - relativePath: path relative to cwd
 */
export const editHandler: Handler = {
  enrich(toolCall: ToolCall): void {
    const rawPath = (toolCall.input.path as string) ?? "";
    toolCall.attributes.absolutePath = resolve(toolCall.cwd, rawPath);
    toolCall.attributes.relativePath = relative(
      toolCall.cwd,
      toolCall.attributes.absolutePath as string,
    );
  },

  summarize(toolCall: ToolCall): string {
    return `edit: ${toolCall.attributes.relativePath}`;
  },
};
