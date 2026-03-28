import type { ToolCall, Handler } from "../types.js";

/**
 * Default handler for tools with no specific handler registered.
 * No enrichment — rules can only match on raw ToolCall fields.
 */
export const defaultHandler: Handler = {
  enrich(): void {},

  summarize(toolCall: ToolCall): string {
    const parts = Object.entries(toolCall.input).map(([key, value]) => {
      const str = typeof value === "string" ? value : JSON.stringify(value);
      return `  ${key}: ${str}`;
    });
    return parts.length > 0
      ? `${toolCall.toolName}:\n${parts.join("\n")}`
      : toolCall.toolName;
  },
};
