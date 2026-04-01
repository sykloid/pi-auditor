# Pi Auditor

A [pi](https://github.com/badlogic/pi-mono) extension that intercepts tool
calls and evaluates them against a configurable rule engine. Each tool call is
either **accepted** (silently proceeds), **rejected** (blocked with a reason
sent to the LLM), or sent for **user verification**.

## How it works

When the agent makes a tool call, Pi Auditor:

1. **Enriches** the call with handler-specific attributes (e.g., `absolutePath`
   and `relativePath` for file operations).
2. **Evaluates** rules in scope order — session → project → global — using
   [CEL](https://cel.dev/) expressions. First match wins.
3. **Acts** on the result: accept, reject, or prompt the user for verification.

If no rule matches, the default action is **verify**.

## Installation

```bash
pi install git:github.com/sykloid/pi-auditor
```

Use `-l` to install as a project-local package instead of global. To try
it without installing:

```bash
pi -e git:github.com/sykloid/pi-auditor
```

## Configuration

Rules are defined in YAML files at two locations:

| Scope   | Path                              |
| ------- | --------------------------------- |
| Project | `<project>/.pi/auditor/rules.yml` |
| Global  | `~/.pi/auditor/rules.yml`         |

Session rules are created at runtime through the verification UI and are not
persisted to disk.

Rules are evaluated in order of specificity: **session → project → global**.
Within each scope, the first matching rule wins.

### Rule format

```yaml
rules:
  - name: allow-reads           # optional, for readability
    when: toolName == "read"    # CEL expression (omit to match all)
    action: accept              # accept, reject, or verify
    reason: "..."               # optional, used for reject/verify
```

### [CEL](https://cel.dev/) expressions

Rules are evaluated against the enriched tool call. Available fields:

| Field          | Description                       |
| -------------- | --------------------------------- |
| `toolName`     | Tool name (`read`, `write`, etc.) |
| `toolCallId`   | Unique ID for this tool call      |
| `cwd`          | Current working directory         |
| `input.*`      | Raw tool input parameters         |
| `attributes.*` | Handler-enriched attributes       |

For path-based tools (`read`, `write`, `edit`), handlers add:

| Attribute                 | Description            |
| ------------------------- | ---------------------- |
| `attributes.absolutePath` | Fully resolved path    |
| `attributes.relativePath` | Path relative to `cwd` |

CEL supports operators like `==`, `!=`, `in`, `contains`, `startsWith`,
`endsWith`, `matches` (regex), and boolean logic (`&&`, `||`, `!`).

### Example rules

```yaml
rules:
  # Allow all reads silently
  - name: allow-reads
    when: toolName == "read"
    action: accept

  # Verify bash commands
  - name: verify-bash
    when: toolName == "bash"
    action: verify

  # Verify writes and edits
  - name: verify-writes
    when: toolName == "write"
    action: verify

  - name: verify-edits
    when: toolName == "edit"
    action: verify

  # Block writes to sensitive files
  - name: block-env
    when: >-
      toolName == "write" &&
      attributes.relativePath.endsWith(".env")
    action: reject
    reason: "Cannot modify .env files"

  # Allow edits within src/
  - name: allow-src-edits
    when: >-
      toolName == "edit" &&
      attributes.relativePath.startsWith("src/")
    action: accept
```

## Extensibility

Each tool (or class of tools) is managed by a **handler** that implements
the `Handler` interface:

```typescript
interface Handler {
  /** Populate toolCall.attributes with derived data. */
  enrich(toolCall: ToolCall): void;
  /** Run the verification UI. Called when a verify action fires. */
  verify(toolCall: ToolCall, ctx: ExtensionContext): Promise<VerifyResult>;
}
```

Handlers have two responsibilities:

1. **Enrichment** — derive attributes from the raw tool call input that
   rules can match against. For example, the path handler resolves
   `absolutePath` and `relativePath` from the input `path` and `cwd`.

2. **Verification** — when a rule triggers a `verify` action, the handler
   owns the full UI flow. It can present any interface it wants and
   optionally return a new rule for the engine to register.

The **default handler** performs no enrichment and shows a simple
confirm dialog. Tool-specific handlers can override both behaviors.

### Path handler verification UI

The built-in path handler (used for `read`, `write`, and `edit`) provides
a custom verification UI as an example of what handlers can do. It presents
three options:

- **Accept** — allow this specific call (one-shot)
- **Reject** — block this specific call (one-shot)
- **Rule** — define a persistent rule with editable fields:

```
  › Accept
    Reject
    Accept edits to src/foo.ts for this session
```

The rule option is a sentence with three editable fields (navigate with
tab, cycle with ↑↓):

| Field  | Options                                       |
| ------ | --------------------------------------------- |
| Action | Accept, Reject                                |
| Path   | exact file, directory, this project, any file |
| Scope  | for this session, for this project, globally  |

Rules created at project or global scope are persisted to their respective
YAML files automatically.

#### Elaboration

On Accept or Reject, pressing TAB enters inline elaboration mode — a
text input appears on the same line:

```
  › Accept, use the helper function instead
```

- On **accept**, the elaboration is sent as a steering message to the
  agent, delivered before the next LLM call.
- On **reject**, the elaboration replaces the default rejection reason.

Backspace on an empty input exits elaboration.

## Commands

The extension registers `/auditor` with the following subcommands:

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `/auditor reload` | Reload rules from disk               |
| `/auditor status` | Show loaded rule counts per scope    |
| `/auditor list`   | Show all loaded rules in a styled UI |

## Development

```bash
# Run tests
npm test

# Type check
npx tsc --noEmit

# Format
npm run format

# Lint
npm run lint

# Tests with coverage
npm run test:coverage
```

## License

[MIT](LICENSE)
