import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Rule, AuditAction } from "./types.js";

/** Raw rule as it appears in the config file. */
interface RawRule {
  name?: string;
  when?: string;
  action?: string;
  reason?: string;
}

/** Raw config file shape. */
interface RawConfig {
  rules?: RawRule[];
}

function parseAction(raw: RawRule): AuditAction {
  switch (raw.action) {
    case "accept":
      return { type: "accept" };
    case "reject":
      return { type: "reject", reason: raw.reason ?? "Rejected by rule" };
    case "verify":
      return { type: "verify", reason: raw.reason ?? "" };
    case undefined:
      return { type: "verify", reason: raw.reason ?? "" };
    default:
      throw new Error(`Unknown action: ${raw.action}`);
  }
}

function parseRule(raw: RawRule): Rule {
  return {
    name: raw.name,
    when: raw.when,
    action: parseAction(raw),
  };
}

/** Parse rules from a YAML string. */
export function parseRules(yaml: string): Rule[] {
  const config = parseYaml(yaml) as RawConfig | null;
  if (!config?.rules) return [];
  return config.rules.map(parseRule);
}

/** Load rules from a YAML file. Returns empty array if file doesn't exist. */
export function loadRules(path: string): Rule[] {
  try {
    const content = readFileSync(path, "utf-8");
    return parseRules(content);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Serialize a Rule back to the raw YAML shape. */
function serializeRule(rule: Rule): RawRule {
  const raw: RawRule = {};
  if (rule.name) raw.name = rule.name;
  if (rule.when) raw.when = rule.when;
  raw.action = rule.action.type;
  if (rule.action.type === "reject") raw.reason = rule.action.reason;
  if (rule.action.type === "verify" && rule.action.reason) raw.reason = rule.action.reason;
  return raw;
}

/**
 * Append a rule to a YAML rules file.
 *
 * Reads the current file (preserving external edits), appends the rule,
 * and writes back. Creates the file and parent directories if needed.
 * Does not modify any in-memory state.
 */
export function appendRule(path: string, rule: Rule): void {
  let rawRules: RawRule[] = [];
  try {
    const content = readFileSync(path, "utf-8");
    const config = parseYaml(content) as RawConfig | null;
    rawRules = config?.rules ?? [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  rawRules.push(serializeRule(rule));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyYaml({ rules: rawRules }), "utf-8");
}
