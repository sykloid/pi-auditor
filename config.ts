import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
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
