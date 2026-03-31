import { strict as assert } from "node:assert";
import { resolve, relative, dirname } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import type { ToolCall, Handler, VerifyResult, RuleScope } from "../types.js";
import {
  PathVerifyControl,
  type PathVerifyOption,
  type ScopeOption,
  type PathVerifyControlTheme,
  type PathVerifyResult,
} from "../ui/path-verify-control.js";

// ---------------------------------------------------------------------------
// Generalizations — private to path handlers
// ---------------------------------------------------------------------------

/** Build the list of path options from most specific to broadest. */
export function buildPathOptions(relPath: string): PathVerifyOption[] {
  const options: PathVerifyOption[] = [];

  // 1. This exact file
  options.push({ label: relPath, value: `file:${relPath}`, kind: "file" });

  // 2. Containing directory
  const dir = dirname(relPath);
  if (dir !== ".") {
    options.push({ label: `${dir}/`, value: `dir:${dir}`, kind: "dir" });
  }

  // 3. This project (only if nested under cwd, not directly in cwd root)
  if (!relPath.startsWith("..") && dir !== ".") {
    options.push({ label: "this project", value: "project", kind: "project" });
  }

  // 4. All calls for this tool
  options.push({ label: `any file`, value: "all", kind: "all" });

  return options;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  { label: "for this session", value: "session" },
  { label: "for this project", value: "project" },
  { label: "globally", value: "global" },
];

/** Convert a PathVerifyResult into a VerifyResult with an optional rule. */
export function toVerifyResult(result: PathVerifyResult, toolName: string): VerifyResult {
  if (result.type === "accept") return { accepted: true };
  if (result.type === "reject") return { accepted: false };

  assert(result.type === "rule", `unexpected verify result type: ${result.type}`);
  const r = result.rule!;
  assert(
    r.scope === "session" || r.scope === "project" || r.scope === "global",
    `unexpected rule scope: ${r.scope}`,
  );
  const scope: RuleScope = r.scope;
  const accepted = r.action === "accept";

  // Build CEL expression
  let when: string;
  switch (true) {
    case r.path.startsWith("file:"):
      when = `toolName == "${toolName}" && attributes.relativePath == "${r.path.slice(5)}"`;
      break;
    case r.path.startsWith("dir:"):
      when = `toolName == "${toolName}" && attributes.relativePath.startsWith("${r.path.slice(4)}/")`;
      break;
    case r.path === "project":
      when = `toolName == "${toolName}" && !attributes.relativePath.startsWith("..")`;
      break;
    case r.path === "all":
      when = `toolName == "${toolName}"`;
      break;
    default:
      when = `toolName == "${toolName}"`;
  }

  return {
    accepted,
    newRule: {
      rule: {
        name: `user-rule-${toolName}-${Date.now()}`,
        when,
        action: accepted ? { type: "accept" } : { type: "reject", reason: "Rejected by user rule." },
      },
      scope,
    },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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
      const relPath = toolCall.attributes.relativePath as string;
      const pathOptions = buildPathOptions(relPath);

      const result = await ctx.ui.custom<PathVerifyResult>(
        (tui, theme, _kb, done) => {
          const controlTheme: PathVerifyControlTheme = {
            selected: (t) => theme.fg("accent", t),
            unselected: (t) => theme.fg("muted", t),
            fieldActive: (t) => theme.fg("accent", theme.bold(t)),
            fieldInactive: (t) => theme.fg("dim", t),
            hint: (t) => theme.fg("dim", t),
          };

          const control = new PathVerifyControl(
            { toolName, pathOptions, scopeOptions: SCOPE_OPTIONS },
            controlTheme,
          );

          control.onSubmit = () => done(control.getValue());
          control.onCancel = () => done({ type: "reject" });

          const container = new Container();
          container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
          container.addChild(new Text(theme.fg("text", ` Verify: ${toolName} ${relPath}`), 0, 0));
          container.addChild(new Text("", 0, 0));

          const bottomBorder = new DynamicBorder((s: string) => theme.fg("accent", s));

          return {
            render(width: number): string[] {
              const top = container.render(width);
              const body = control.render(width);
              const bottom = bottomBorder.render(width);
              return [...top, ...body, ...bottom];
            },
            invalidate() {
              container.invalidate();
              control.invalidate();
              bottomBorder.invalidate();
            },
            handleInput(data: string) {
              control.handleInput(data);
              tui.requestRender();
            },
          };
        },
      );

      return toVerifyResult(result, toolName);
    },
  };
}
