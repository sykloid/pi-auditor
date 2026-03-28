import { describe, it, expect } from "vitest";
import { defaultHandler } from "../handlers/default.js";
import { readHandler } from "../handlers/read.js";
import { writeHandler } from "../handlers/write.js";
import { editHandler } from "../handlers/edit.js";
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

  it("summarize pretty-prints all inputs", () => {
    const tc = makeToolCall({ toolName: "foo", input: { path: "/bar", count: 3 } });
    expect(defaultHandler.summarize(tc)).toBe("foo:\n  path: /bar\n  count: 3");
  });

  it("summarize returns tool name when no inputs", () => {
    const tc = makeToolCall({ toolName: "foo", input: {} });
    expect(defaultHandler.summarize(tc)).toBe("foo");
  });

  it("summarize JSON-stringifies non-string values", () => {
    const tc = makeToolCall({ toolName: "foo", input: { flag: true, items: [1, 2] } });
    expect(defaultHandler.summarize(tc)).toBe("foo:\n  flag: true\n  items: [1,2]");
  });
});

describe("readHandler", () => {
  it("enriches with absolute and relative paths", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "src/foo.ts" } });
    readHandler.enrich(tc);
    expect(tc.attributes.absolutePath).toBe("/project/src/foo.ts");
    expect(tc.attributes.relativePath).toBe("src/foo.ts");
  });

  it("handles absolute input path", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "/etc/hosts" } });
    readHandler.enrich(tc);
    expect(tc.attributes.absolutePath).toBe("/etc/hosts");
    expect(tc.attributes.relativePath).toBe("../etc/hosts");
  });

  it("handles missing path", () => {
    const tc = makeToolCall({ cwd: "/project", input: {} });
    readHandler.enrich(tc);
    expect(tc.attributes.absolutePath).toBe("/project");
    expect(tc.attributes.relativePath).toBe("");
  });

  it("summarize returns read: relativePath", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "src/foo.ts" } });
    readHandler.enrich(tc);
    expect(readHandler.summarize(tc)).toBe("read: src/foo.ts");
  });
});

describe("writeHandler", () => {
  it("enriches with absolute and relative paths", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "out/result.json" } });
    writeHandler.enrich(tc);
    expect(tc.attributes.absolutePath).toBe("/project/out/result.json");
    expect(tc.attributes.relativePath).toBe("out/result.json");
  });

  it("summarize returns write: relativePath", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "out/result.json" } });
    writeHandler.enrich(tc);
    expect(writeHandler.summarize(tc)).toBe("write: out/result.json");
  });
});

describe("editHandler", () => {
  it("enriches with absolute and relative paths", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "src/main.ts" } });
    editHandler.enrich(tc);
    expect(tc.attributes.absolutePath).toBe("/project/src/main.ts");
    expect(tc.attributes.relativePath).toBe("src/main.ts");
  });

  it("summarize returns edit: relativePath", () => {
    const tc = makeToolCall({ cwd: "/project", input: { path: "src/main.ts" } });
    editHandler.enrich(tc);
    expect(editHandler.summarize(tc)).toBe("edit: src/main.ts");
  });
});
