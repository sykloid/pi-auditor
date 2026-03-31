import { type Component, matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PathOptionKind = "file" | "dir" | "project" | "all";

export interface PathVerifyOption {
  label: string;
  value: string;
  kind: PathOptionKind;
}

export interface ScopeOption {
  label: string;
  value: string;
}

export interface PathVerifyControlTheme {
  selected: (text: string) => string;
  unselected: (text: string) => string;
  fieldActive: (text: string) => string;
  fieldInactive: (text: string) => string;
  hint: (text: string) => string;
  label: (text: string) => string;
}

export interface PathVerifyControlOptions {
  toolName: string;
  /** Possible path generalizations, from most specific to broadest. */
  pathOptions: PathVerifyOption[];
  /** Possible scopes, from narrowest to broadest. */
  scopeOptions: ScopeOption[];
}

export interface PathVerifyResult {
  /** Which top-level option was chosen: "accept", "reject", or "rule". */
  type: "accept" | "reject" | "rule";
  /** Only present when type === "rule". */
  rule?: {
    action: "accept" | "reject";
    path: string;
    scope: string;
  };
}

// ---------------------------------------------------------------------------
// Sentence composition
// ---------------------------------------------------------------------------

interface ActionOption {
  label: string;
  value: string;
  /** Plural verb form for broader scopes, e.g. "Accept" → "Accept". Tool is pluralized instead. */
}

const RULE_ACTIONS: ActionOption[] = [
  { label: "Accept", value: "accept" },
  { label: "Reject", value: "reject" },
];

/**
 * Compose a grammatically correct rule sentence from the current field values.
 *
 * Examples:
 *   "Accept edit to test-verify.txt for this session"
 *   "Accept edits to files in src/ for this session"
 *   "Accept edits to files in this project globally"
 *   "Accept all edits for this session"
 *   "Reject write to foo.ts for this project"
 */
function composeSentence(
  action: ActionOption,
  toolName: string,
  pathOpt: PathVerifyOption,
  scopeOpt: ScopeOption,
): { segments: SentenceSegment[] } {
  const plural = toolName + "s";
  const segments: SentenceSegment[] = [];

  segments.push({ text: action.label, field: 0 });
  segments.push({ text: ` ${plural} to ` });

  switch (pathOpt.kind) {
    case "file":
      segments.push({ text: pathOpt.label, field: 1 });
      break;
    case "dir":
      segments.push({ text: `files in ${pathOpt.label}`, field: 1 });
      break;
    case "project":
      segments.push({ text: "files in this project", field: 1 });
      break;
    case "all":
      segments.push({ text: "any file", field: 1 });
      break;
  }

  segments.push({ text: " " });
  segments.push({ text: scopeOpt.label, field: 2 });

  return { segments };
}

interface SentenceSegment {
  text: string;
  /** If set, this segment is a field that can be edited. */
  field?: number;
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

type Mode = "select" | "rule-edit";

/**
 * Verification control for path-based tool calls.
 *
 * Presents three options:
 *   1. Accept (one-shot)
 *   2. Reject (one-shot)
 *   3. Rule — a sentence composed from editable fields
 *
 * Tab enters field editing on option 3. In field editing, tab/shift-tab
 * cycles between fields, up/down cycles values within a field, escape
 * exits to option selection.
 */
export class PathVerifyControl implements Component {
  private readonly theme: PathVerifyControlTheme;
  private readonly toolName: string;
  private readonly pathOptions: PathVerifyOption[];
  private readonly scopeOptions: ScopeOption[];

  // Top-level selection (0=accept, 1=reject, 2=rule)
  private selectedIndex = 0;
  private mode: Mode = "select";

  // Rule fields
  private ruleActionIndex = 0;  // 0=accept, 1=reject
  private rulePathIndex = 0;
  private ruleScopeIndex = 0;
  private ruleFieldIndex = 0;  // 0=action, 1=path, 2=scope

  private cachedWidth?: number;
  private cachedLines?: string[];

  onSubmit?: () => void;
  onCancel?: () => void;

  constructor(options: PathVerifyControlOptions, theme: PathVerifyControlTheme) {
    this.toolName = options.toolName;
    this.pathOptions = options.pathOptions;
    this.scopeOptions = options.scopeOptions;
    this.theme = theme;
  }

  getValue(): PathVerifyResult {
    switch (this.selectedIndex) {
      case 0:
        return { type: "accept" };
      case 1:
        return { type: "reject" };
      case 2:
        return {
          type: "rule",
          rule: {
            action: RULE_ACTIONS[this.ruleActionIndex]!.value as "accept" | "reject",
            path: this.pathOptions[this.rulePathIndex]!.value,
            scope: this.scopeOptions[this.ruleScopeIndex]!.value,
          },
        };
      default:
        return { type: "reject" };
    }
  }

  handleInput(data: string): void {
    if (this.mode === "rule-edit") {
      this.handleRuleEditInput(data);
    } else {
      this.handleSelectInput(data);
    }
  }

  private handleSelectInput(data: string): void {
    if (matchesKey(data, Key.up) && this.selectedIndex > 0) {
      this.selectedIndex--;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.down) && this.selectedIndex < 2) {
      this.selectedIndex++;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.onSubmit?.();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      this.onCancel?.();
      return;
    }
    if (matchesKey(data, Key.tab) && this.selectedIndex === 2) {
      this.mode = "rule-edit";
      this.ruleFieldIndex = 0;
      this.invalidate();
      return;
    }
  }

  private handleRuleEditInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.mode = "select";
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.onSubmit?.();
      return;
    }
    if (matchesKey(data, Key.tab)) {
      this.ruleFieldIndex = (this.ruleFieldIndex + 1) % 3;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.shift(Key.tab))) {
      this.ruleFieldIndex = (this.ruleFieldIndex + 2) % 3;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
      const delta = matchesKey(data, Key.up) ? -1 : 1;
      switch (this.ruleFieldIndex) {
        case 0: {
          const len = RULE_ACTIONS.length;
          this.ruleActionIndex = (this.ruleActionIndex + delta + len) % len;
          break;
        }
        case 1: {
          const len = this.pathOptions.length;
          this.rulePathIndex = (this.rulePathIndex + delta + len) % len;
          break;
        }
        case 2: {
          const len = this.scopeOptions.length;
          this.ruleScopeIndex = (this.ruleScopeIndex + delta + len) % len;
          break;
        }
      }
      this.invalidate();
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const inSelect = this.mode === "select";

    // Option 0: Accept
    lines.push(this.renderSimpleOption(0, "Accept", inSelect, width));

    // Option 1: Reject
    lines.push(this.renderSimpleOption(1, "Reject", inSelect, width));

    // Option 2: Rule
    lines.push(this.renderRuleLine(inSelect, width));

    // Hint line
    lines.push(this.renderHint(width));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  private renderSimpleOption(index: number, label: string, inSelect: boolean, width: number): string {
    const isSelected = inSelect && this.selectedIndex === index;
    const prefix = isSelected ? "› " : "  ";
    const style = isSelected ? this.theme.selected : this.theme.unselected;
    return truncateToWidth(style(`  ${prefix}${label}`), width);
  }

  private renderRuleLine(inSelect: boolean, width: number): string {
    const isSelected = this.selectedIndex === 2;
    const prefix = (inSelect && isSelected) ? "› " : "  ";
    const prefixStyle = (inSelect && isSelected) ? this.theme.selected : this.theme.unselected;
    const inEdit = this.mode === "rule-edit";

    const action = RULE_ACTIONS[this.ruleActionIndex]!;
    const pathOpt = this.pathOptions[this.rulePathIndex]!;
    const scopeOpt = this.scopeOptions[this.ruleScopeIndex]!;

    const { segments } = composeSentence(action, this.toolName, pathOpt, scopeOpt);

    const parts = [prefixStyle(`  ${prefix}`)];
    for (const seg of segments) {
      if (!isSelected) {
        // Not selected: entire line is dim
        parts.push(this.theme.unselected(seg.text));
      } else if (seg.field !== undefined) {
        // Selected: fields are bright (active field is accented in edit mode)
        if (inEdit && seg.field === this.ruleFieldIndex) {
          parts.push(this.theme.fieldActive(seg.text));
        } else {
          parts.push(this.theme.selected(seg.text));
        }
      } else {
        // Selected: non-field text is dim
        parts.push(this.theme.hint(seg.text));
      }
    }

    return truncateToWidth(parts.join(""), width);
  }

  private renderHint(width: number): string {
    let parts: string[];
    if (this.mode === "rule-edit") {
      parts = ["↑↓ cycle", "tab/shift-tab fields", "enter submit", "esc back"];
    } else {
      parts = ["↑↓ select", "enter submit"];
      if (this.selectedIndex === 2) {
        parts.push("tab edit rule");
      }
    }
    return truncateToWidth(this.theme.hint("  " + parts.join(" • ")), width);
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
