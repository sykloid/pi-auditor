import { describe, it, expect } from "vitest";
import { Auditor } from "../engine.js";
import type { ToolCall } from "../types.js";

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    toolName: "some_tool",
    toolCallId: "test-id",
    cwd: "/test",
    input: {},
    attributes: {},
    ...overrides,
  };
}

describe("Auditor.evaluate", () => {
  describe("default behavior (no rules)", () => {
    it("returns verify with pretty-printed inputs when no handler and no rules", () => {
      const auditor = new Auditor();
      const toolCall = makeToolCall({ toolName: "unknown", input: { path: "/foo", limit: 10 } });
      const action = auditor.evaluate(toolCall);

      expect(action.type).toBe("verify");
    });

    it("returns verify with tool name only when no inputs", () => {
      const auditor = new Auditor();
      const toolCall = makeToolCall({ toolName: "unknown", input: {} });
      const action = auditor.evaluate(toolCall);

      expect(action.type).toBe("verify");
    });
  });

  describe("CEL rule evaluation", () => {
    it("matches on toolName", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [{ when: 'toolName == "bash"', action: { type: "accept" } }]);

      expect(auditor.evaluate(makeToolCall({ toolName: "bash" })).type).toBe("accept");
      expect(auditor.evaluate(makeToolCall({ toolName: "read" })).type).toBe("verify");
    });

    it("matches on input fields", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [
        { when: 'input.path == "/etc/passwd"', action: { type: "reject", reason: "sensitive" } },
      ]);

      const sensitive = makeToolCall({ input: { path: "/etc/passwd" } });
      expect(auditor.evaluate(sensitive)).toEqual({ type: "reject", reason: "sensitive" });

      const safe = makeToolCall({ input: { path: "/src/foo.ts" } });
      expect(auditor.evaluate(safe).type).toBe("verify");
    });

    it("matches on attributes after handler enrichment", () => {
      const auditor = new Auditor();
      auditor.registerHandler("read", {
        enrich(toolCall: ToolCall) {
          toolCall.attributes.ext = (toolCall.input.path as string).split(".").pop();
        },
        async verify() {
          return { accepted: false };
        },
      });
      auditor.setRules("global", [{ when: 'attributes.ext == "ts"', action: { type: "accept" } }]);

      const ts = makeToolCall({ toolName: "read", input: { path: "foo.ts" } });
      expect(auditor.evaluate(ts).type).toBe("accept");

      const js = makeToolCall({ toolName: "read", input: { path: "foo.js" } });
      expect(auditor.evaluate(js).type).toBe("verify");
    });

    it("supports string methods: contains, startsWith, endsWith", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [
        { when: 'input.command.contains("rm")', action: { type: "reject", reason: "rm" } },
      ]);

      const rm = makeToolCall({ input: { command: "rm -rf /tmp" } });
      expect(auditor.evaluate(rm).type).toBe("reject");

      const ls = makeToolCall({ input: { command: "ls -la" } });
      expect(auditor.evaluate(ls).type).toBe("verify");
    });

    it("supports matches() for regex", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [
        {
          when: 'input.command.matches("^(cat|head|tail|echo)\\\\b.*")',
          action: { type: "accept" },
        },
      ]);

      const cat = makeToolCall({ input: { command: "cat foo.txt" } });
      expect(auditor.evaluate(cat).type).toBe("accept");

      const rm = makeToolCall({ input: { command: "rm foo.txt" } });
      expect(auditor.evaluate(rm).type).toBe("verify");
    });

    it("supports in operator", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [
        { when: 'toolName in ["read", "ls", "find"]', action: { type: "accept" } },
      ]);

      expect(auditor.evaluate(makeToolCall({ toolName: "read" })).type).toBe("accept");
      expect(auditor.evaluate(makeToolCall({ toolName: "ls" })).type).toBe("accept");
      expect(auditor.evaluate(makeToolCall({ toolName: "bash" })).type).toBe("verify");
    });

    it("supports logical operators: && || !", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [
        {
          when: 'toolName == "bash" && !input.command.contains("rm")',
          action: { type: "accept" },
        },
      ]);

      const safe = makeToolCall({ toolName: "bash", input: { command: "ls -la" } });
      expect(auditor.evaluate(safe).type).toBe("accept");

      const dangerous = makeToolCall({ toolName: "bash", input: { command: "rm -rf /" } });
      expect(auditor.evaluate(dangerous).type).toBe("verify");

      const notBash = makeToolCall({ toolName: "read", input: { command: "ls" } });
      expect(auditor.evaluate(notBash).type).toBe("verify");
    });

    it("first matching rule wins", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [
        { when: 'toolName == "bash"', action: { type: "reject", reason: "first" } },
        { when: 'toolName == "bash"', action: { type: "accept" } },
      ]);

      expect(auditor.evaluate(makeToolCall({ toolName: "bash" }))).toEqual({
        type: "reject",
        reason: "first",
      });
    });

    it("rule without when clause always matches (catch-all)", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [{ action: { type: "accept" } }]);

      expect(auditor.evaluate(makeToolCall({ toolName: "anything" })).type).toBe("accept");
    });

    it("malformed CEL expression fails closed (does not match)", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [
        { when: "this is not valid CEL !!!", action: { type: "accept" } },
      ]);

      expect(auditor.evaluate(makeToolCall()).type).toBe("verify");
    });
  });

  describe("scope ordering", () => {
    it("session rules override project rules", () => {
      const auditor = new Auditor();
      auditor.setRules("project", [
        { when: 'toolName == "bash"', action: { type: "reject", reason: "project" } },
      ]);
      auditor.setRules("session", [{ when: 'toolName == "bash"', action: { type: "accept" } }]);

      expect(auditor.evaluate(makeToolCall({ toolName: "bash" })).type).toBe("accept");
    });

    it("project rules override global rules", () => {
      const auditor = new Auditor();
      auditor.setRules("global", [
        { when: 'toolName == "bash"', action: { type: "reject", reason: "global" } },
      ]);
      auditor.setRules("project", [{ when: 'toolName == "bash"', action: { type: "accept" } }]);

      expect(auditor.evaluate(makeToolCall({ toolName: "bash" })).type).toBe("accept");
    });

    it("falls through scopes when no match", () => {
      const auditor = new Auditor();
      auditor.setRules("session", [{ when: 'toolName == "read"', action: { type: "accept" } }]);
      auditor.setRules("global", [
        { when: 'toolName == "bash"', action: { type: "reject", reason: "global" } },
      ]);

      expect(auditor.evaluate(makeToolCall({ toolName: "bash" }))).toEqual({
        type: "reject",
        reason: "global",
      });
    });

    it("clearRules removes rules for a scope", () => {
      const auditor = new Auditor();
      auditor.setRules("session", [{ action: { type: "accept" } }]);
      auditor.clearRules("session");

      expect(auditor.evaluate(makeToolCall()).type).toBe("verify");
    });

    it("addRule prepends to a scope", () => {
      const auditor = new Auditor();
      auditor.setRules("session", [{ action: { type: "reject", reason: "original" } }]);
      auditor.addRule("session", { action: { type: "accept" } });

      expect(auditor.evaluate(makeToolCall()).type).toBe("accept");
    });
  });
});
