import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseRules, loadRules, appendRule } from "../config.js";

describe("parseRules", () => {
  it("parses a complete rule", () => {
    const rules = parseRules(`
rules:
  - name: block-env
    when: 'input.path.contains(".env")'
    action: reject
    reason: "Protected file"
`);
    expect(rules).toEqual([
      {
        name: "block-env",
        when: 'input.path.contains(".env")',
        action: { type: "reject", reason: "Protected file" },
      },
    ]);
  });

  it("parses accept action", () => {
    const rules = parseRules(`
rules:
  - action: accept
`);
    expect(rules).toEqual([{ name: undefined, when: undefined, action: { type: "accept" } }]);
  });

  it("parses verify action", () => {
    const rules = parseRules(`
rules:
  - action: verify
    reason: "Please confirm"
`);
    expect(rules).toEqual([
      { name: undefined, when: undefined, action: { type: "verify", reason: "Please confirm" } },
    ]);
  });

  it("defaults to verify when action is omitted", () => {
    const rules = parseRules(`
rules:
  - when: 'toolName == "bash"'
`);
    expect(rules).toEqual([
      { name: undefined, when: 'toolName == "bash"', action: { type: "verify", reason: "" } },
    ]);
  });

  it("provides default reason for reject", () => {
    const rules = parseRules(`
rules:
  - action: reject
`);
    expect(rules[0]!.action).toEqual({ type: "reject", reason: "Rejected by rule" });
  });

  it("parses multiple rules", () => {
    const rules = parseRules(`
rules:
  - action: accept
  - action: reject
  - action: verify
`);
    expect(rules).toHaveLength(3);
    expect(rules[0]!.action.type).toBe("accept");
    expect(rules[1]!.action.type).toBe("reject");
    expect(rules[2]!.action.type).toBe("verify");
  });

  it("returns empty array for empty config", () => {
    expect(parseRules("")).toEqual([]);
    expect(parseRules("{}")).toEqual([]);
  });

  it("returns empty array for config with no rules", () => {
    expect(parseRules("rules:")).toEqual([]);
  });

  it("throws on unknown action", () => {
    expect(() =>
      parseRules(`
rules:
  - action: explode
`),
    ).toThrow("Unknown action: explode");
  });

  it("all fields are optional", () => {
    const rules = parseRules(`
rules:
  - {}
`);
    expect(rules).toEqual([
      { name: undefined, when: undefined, action: { type: "verify", reason: "" } },
    ]);
  });
});

describe("loadRules", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-test");
  const tmpFile = join(tmpDir, "rules.yml");

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads rules from a YAML file", () => {
    writeFileSync(
      tmpFile,
      `
rules:
  - name: test-rule
    when: 'toolName == "bash"'
    action: accept
`,
    );
    const rules = loadRules(tmpFile);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.name).toBe("test-rule");
    expect(rules[0]!.action.type).toBe("accept");
  });

  it("returns empty array when file does not exist", () => {
    expect(loadRules(join(tmpDir, "nonexistent.yml"))).toEqual([]);
  });

  it("throws on invalid YAML (not ENOENT)", () => {
    writeFileSync(tmpFile, ":\n  :\n  - :\n  invalid: [");
    expect(() => loadRules(tmpFile)).toThrow();
  });
});

describe("appendRule", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-test-append");
  const tmpFile = join(tmpDir, "rules.yml");

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates file and directories if they don't exist", () => {
    const nested = join(tmpDir, "a", "b", "rules.yml");
    appendRule(nested, {
      name: "new-rule",
      when: 'toolName == "bash"',
      action: { type: "accept" },
    });
    const rules = loadRules(nested);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.name).toBe("new-rule");
  });

  it("appends to existing rules without clobbering", () => {
    writeFileSync(tmpFile, `rules:\n  - name: existing\n    action: accept\n`);
    appendRule(tmpFile, { name: "appended", action: { type: "reject", reason: "no" } });
    const rules = loadRules(tmpFile);
    expect(rules).toHaveLength(2);
    expect(rules[0]!.name).toBe("existing");
    expect(rules[1]!.name).toBe("appended");
    expect(rules[1]!.action).toEqual({ type: "reject", reason: "no" });
  });

  it("appends to empty file", () => {
    writeFileSync(tmpFile, "");
    appendRule(tmpFile, { action: { type: "verify", reason: "check" } });
    const rules = loadRules(tmpFile);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action).toEqual({ type: "verify", reason: "check" });
  });

  it("persists when expression", () => {
    appendRule(tmpFile, { when: 'toolName == "edit"', action: { type: "accept" } });
    const rules = loadRules(tmpFile);
    expect(rules[0]!.when).toBe('toolName == "edit"');
  });
});
