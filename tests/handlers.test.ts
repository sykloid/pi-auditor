import { describe, it, expect, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
  DynamicBorder: class {},
}));
vi.mock("@mariozechner/pi-tui", () => ({
  Container: class { addChild() {} },
  Text: class {},
  matchesKey: () => false,
  Key: {},
  truncateToWidth: (s: string) => s,
}));

import { defaultHandler } from "../handlers/default.js";
import { pathHandler, buildPathOptions, toVerifyResult } from "../handlers/path.js";
import type { ToolCall } from "../types.js";
import type { PathVerifyResult } from "../ui/path-verify-control.js";

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

describe("buildPathOptions", () => {
  it("returns file, dir, project, and all for nested path", () => {
    const opts = buildPathOptions("src/handlers/path.ts");
    expect(opts.map(o => o.kind)).toEqual(["file", "dir", "project", "all"]);
    expect(opts[0]!.label).toBe("src/handlers/path.ts");
    expect(opts[0]!.value).toBe("file:src/handlers/path.ts");
    expect(opts[1]!.label).toBe("src/handlers/");
    expect(opts[1]!.value).toBe("dir:src/handlers");
    expect(opts[2]!.kind).toBe("project");
    expect(opts[3]!.kind).toBe("all");
  });

  it("omits dir and project for file directly in cwd", () => {
    const opts = buildPathOptions("foo.ts");
    expect(opts.map(o => o.kind)).toEqual(["file", "all"]);
  });

  it("omits project for file outside cwd", () => {
    const opts = buildPathOptions("../etc/hosts");
    expect(opts.find(o => o.kind === "project")).toBeUndefined();
  });

  it("includes dir and project for file one level deep", () => {
    const opts = buildPathOptions("src/foo.ts");
    expect(opts.map(o => o.kind)).toEqual(["file", "dir", "project", "all"]);
  });
});

describe("toVerifyResult", () => {
  it("returns accepted for accept type", () => {
    const result = toVerifyResult({ type: "accept" }, "edit");
    expect(result).toEqual({ accepted: true });
  });

  it("returns rejected for reject type", () => {
    const result = toVerifyResult({ type: "reject" }, "edit");
    expect(result).toEqual({ accepted: false });
  });

  it("generates file rule with CEL expression", () => {
    const input: PathVerifyResult = {
      type: "rule",
      rule: { action: "accept", path: "file:src/foo.ts", scope: "session" },
    };
    const result = toVerifyResult(input, "edit");
    expect(result.accepted).toBe(true);
    expect(result.newRule!.scope).toBe("session");
    expect(result.newRule!.rule.when).toBe('toolName == "edit" && attributes.relativePath == "src/foo.ts"');
    expect(result.newRule!.rule.action).toEqual({ type: "accept" });
  });

  it("generates dir rule with startsWith", () => {
    const input: PathVerifyResult = {
      type: "rule",
      rule: { action: "accept", path: "dir:src/handlers", scope: "project" },
    };
    const result = toVerifyResult(input, "write");
    expect(result.newRule!.rule.when).toBe('toolName == "write" && attributes.relativePath.startsWith("src/handlers/")');
    expect(result.newRule!.scope).toBe("project");
  });

  it("generates project rule", () => {
    const input: PathVerifyResult = {
      type: "rule",
      rule: { action: "reject", path: "project", scope: "global" },
    };
    const result = toVerifyResult(input, "read");
    expect(result.accepted).toBe(false);
    expect(result.newRule!.rule.when).toBe('toolName == "read" && !attributes.relativePath.startsWith("..")');
    expect(result.newRule!.rule.action).toEqual({ type: "reject", reason: "Rejected by user rule." });
    expect(result.newRule!.scope).toBe("global");
  });

  it("generates all rule", () => {
    const input: PathVerifyResult = {
      type: "rule",
      rule: { action: "accept", path: "all", scope: "session" },
    };
    const result = toVerifyResult(input, "edit");
    expect(result.newRule!.rule.when).toBe('toolName == "edit"');
  });

  it("asserts on unexpected type", () => {
    expect(() => toVerifyResult({ type: "bogus" as "accept" }, "edit")).toThrow();
  });

  it("asserts on unexpected scope", () => {
    const input: PathVerifyResult = {
      type: "rule",
      rule: { action: "accept", path: "all", scope: "bogus" },
    };
    expect(() => toVerifyResult(input, "edit")).toThrow("unexpected rule scope");
  });
});
