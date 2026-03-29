import { describe, it, expect } from "vitest";
import { defaultHandler } from "../handlers/default.js";
import { pathHandler } from "../handlers/path.js";
import type { ToolCall } from "../types.js";

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    toolName: "some_tool",
    toolCallId: "test-id",
    cwd: "/project",
    input: {},
    attributes: {},
    ...overrides,
  };
}

describe("defaultHandler", () => {
  it("enrich is a no-op", () => {
    const tc = makeToolCall();
    defaultHandler.enrich(tc);
    expect(tc.attributes).toEqual({});
  });
});

describe("pathHandler", () => {
  const handler = pathHandler("read");

  it("enriches with absolute and relative paths", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "src/foo.ts" } });
    handler.enrich(tc);
    expect(tc.attributes.absolutePath).toBe("/project/src/foo.ts");
    expect(tc.attributes.relativePath).toBe("src/foo.ts");
  });

  it("handles absolute input path", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "/etc/hosts" } });
    handler.enrich(tc);
    expect(tc.attributes.absolutePath).toBe("/etc/hosts");
    expect(tc.attributes.relativePath).toBe("../etc/hosts");
  });

  it("handles missing path", () => {
    const tc = makeToolCall({ cwd: "/project", input: {} });
    handler.enrich(tc);
    expect(tc.attributes.absolutePath).toBe("/project");
    expect(tc.attributes.relativePath).toBe("");
  });
});
