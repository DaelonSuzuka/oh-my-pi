# Local Oh My Pi Build

Personal build of the `omp` coding agent, stripped of outbound reporting,
configured to reach models only through the local genai-bridge proxy, and with
the system prompt reduced to harness mechanics.

Companion to `~/projects/opencode/opencode-local.md`, which documents the same
treatment applied to opencode. Durable audit detail lives in [`lode/`](lode/lode-map.md).

## Base

- Repo: https://github.com/can1357/oh-my-pi
- Source version: `17.2.12` (unreleased — npm latest is `17.2.11`)
- Branch: `local-build` off `main` at `896bf5f33`
- Diff: 13 files, +96 / −184

## Status

- [x] Telemetry audit & removal
- [x] Provider wiring to genai-bridge (24 models, all built-ins disabled)
- [x] Claude-Code and opencode config discovery disabled
- [x] System prompt partitioned (mechanics kept, engineering opinion removed)
- [x] `omp` linked onto PATH
- [x] End-to-end verified on both wire protocols
- [ ] Natives built from source (running the published prebuilt; see below)
- [ ] `agents/` role prompts swept for operator-domain content

## The structural difference from opencode

**Providers need no patching.** oh-my-pi supports custom providers as
first-class config — `baseUrl`, `auth: none`, and `api:` to pick the wire
protocol — so the entire provider job is config. opencode required patching
`models-dev.ts` and `provider.ts` because it had no such path.

## Config layout

Two files, and **which key goes in which file matters**:

| File | Holds |
|---|---|
| `~/.omp/agent/models.yml` | provider *definitions* — `baseUrl`, `api`, `auth`, `models` |
| `~/.omp/agent/config.yml` | *settings* — including `disabledProviders`, `modelRoles`, `personality` |

`disabledProviders` is a **settings** key (`settings-schema.ts:529`, read via
`settings.get("disabledProviders")` in `config/model-registry.ts:135`). Putting
it in `models.yml` is **silently ignored** — no warning, no error. That mistake
cost a full round of false confidence here.

Keeping it in `config.yml` is also deliberate: it stays in force when
`models.yml` fails to parse, which is exactly when custom providers are dropped
and the built-ins would otherwise be all that is left.

Three behaviours of `config.yml` to know:

- `omp` migrates a hand-written `settings.json` into `config.yml` on first run
  and renames the original to `settings.json.bak`. Editing the `.bak` does
  nothing.
- **The setup wizard rewrites `config.yml` and strips comments.** Do not keep
  explanatory comments there; they will vanish. Documentation belongs in this
  file. The wizard preserves existing keys, but appending to the file blindly is
  unsafe — it moved `disabledProviders` out of last position and an append landed
  after `setupVersion:`, producing invalid YAML that omp quarantined to
  `config.yml.broken-*`. Prefer `omp config set` over hand-editing.
- **A running process never sees a config change.** See below.

### Config changes require a process restart

`settings.ts` has no file watcher, and there is no `/reload` for settings (only
`/reload-plugins` and `mm reload`). A running omp process holds the in-memory
`Settings` it built at launch and never re-reads `config.yml`. So every
`omp config set` affects **processes started afterward, and nothing already
running**.

`/new` does not help — the settings object outlives the conversation. Neither
does `/advisor` off/on: `#buildAdvisorRuntime` genuinely re-resolves the advisor
model, but from `this.#host.settings.get(...)`, so it faithfully reconstructs the
*old* advisor. `docs/advisor-watchdog.md` lists "`/advisor` rebuilds it" and
"configuration is reloaded" as separate triggers precisely because only the latter
picks up a disk edit — and no command exposes it. **Restart the process.**

This bit for real: after the advisor model was switched, long-running sessions kept
producing failures from whichever model was configured at *their* launch — the
`400 unknown field "id"` from `gemini-3.1-flash-lite`, or the role-collapse from
`gemini-2.5-flash`. Both were already fixed on disk.

Everything set via `omp config set` is subject to this: the advisor model,
`disabledProviders` (including the Claude-Code skills fix), `personality`,
`advisor.immuneTurns`, `advisor.syncBacklog`. Hooks under
`~/.omp/agent/hooks/pre/` are also loaded per process, so an edited hook needs the
same restart.

The practical rule: **verify a config change in a freshly launched process.** A
change that appears not to work is more likely an old process than a wrong value.

## Outbound reporting disabled

Four default-on outbound paths, all settings-gated upstream. Three source edits
flip defaults; two hard-return at the network chokepoint.

| File | What |
|------|------|
| `config/settings-schema.ts` | `dev.autoqa` default `true` → `false` |
| `config/settings-schema.ts` | `startup.checkUpdate` default `true` → `false` |
| `config/settings-schema.ts` | `marketplace.autoUpdate` default `"notify"` → `"off"` |
| `tools/report-tool-issue.ts` | `resolvePushConfig()` returns `null` unconditionally; body deleted, and the now-dead `envOverrideString` helper and `$env` import removed with it |
| `catalog/src/provider-models/openai-compat.ts` | `fetchWellKnownModels()` returns `{}` without fetching `catalog.stencil.so`; upstream body retained below as unreachable |

`config.yml` sets the same three values explicitly, so a rebase that loses the
source flips still leaves the install quiet.

`resolvePushConfig` is the right chokepoint because it gates *every* push path —
the background flush, the `PI_AUTO_QA_PUSH=1` headless override, and the explicit
`omp grievances push`. Local SQLite recording still works; nothing reaches
`qa.omp.sh`.

### Left alone deliberately

| Surface | Why |
|---|---|
| OTEL (`agent/src/telemetry.ts`, `coding-agent/src/telemetry-export.ts`) | Genuinely opt-in. Export activates only when a standard `OTEL_EXPORTER_OTLP*_ENDPOINT` env var is set (`telemetry-export.ts:142`). Unset means zero tracer lookups. |
| `ai/src/auth-broker/remote-store.ts` | Usage reports plus hostname, but only when an auth broker is configured. Not on this path. |
| `packages/stats`, `stats/src/user-metrics.ts` | Local SQLite and pure functions. No network. |
| `~/.omp/install-id` | Still generated. Its four consumers are all on unused paths (Codex compat, Anthropic `device_id`, auth broker, auto-QA). See `docs/install-id.md`. |
| `providers.tinyModel` / `memoryModel` / `autoThinkingModel` | Left at `online`, which routes to the gateway. `local` would download 200MB–1.1GB of weights from the HF Hub — *more* outbound traffic, not less. |

## Provider configuration

> **Scope:** The genai-bridge gateway, the 24-model set, and the
> `disabledProviders` list below are the **work Mac** configuration,
> verified there. They are not universal — other machines (e.g. DAEDALUS,
> mbp2) run
> the same fork with different providers in `~/.omp/agent/models.yml` and
> `config.yml`. The source edits documented elsewhere in this file
> (telemetry removal, MCP import restriction, system prompt partition) are
> machine-independent; the provider config is per-host.

| Provider | `api` | `baseUrl` |
|---|---|---|
| `genai-claude` | `anthropic-messages` | `http://localhost:11211/api/anthropic` |
| `genai-gemini` | `google-generative-ai` | `http://localhost:11211/api/gemini/v1/publishers/google` |

Both use `auth: none`. The `baseUrl` shapes are **not** interchangeable:

- `anthropic-messages` strips a trailing `/v1` and appends `/v1/messages`
  (`normalizeAnthropicBaseUrl`, `providers/anthropic.ts:118`), so the base must
  **exclude** the version segment.
- `google-generative-ai` appends `/models/<id>:streamGenerateContent`
  (`providers/google.ts:38`), so the base must **include** it.

`cost` requires all four of `input`, `output`, `cacheRead`, `cacheWrite`.
Omitting the cache pair fails schema validation and silently disables every
custom provider with only a warning — absence of the model table is the failure
signal, not a non-zero exit.

The 24 models are the set live-verified for this bridge during the opencode work;
that file records which ids `/api/tags` advertises but do not serve (all 35
`genai-afm`, `claude-3-5-haiku`, various `*-preview` duplicates).

### What actually gates a built-in provider

Two independent gates:

1. **Credentials.** A built-in is only selectable with resolvable credentials.
2. **`disabledProviders`.** Blocks it regardless of credentials.

Gate 1 alone is insufficient because credentials resolve from **environment
variables** — a stray `ANTHROPIC_API_KEY` surfaces 26 built-in models pointing at
`api.anthropic.com`. Gate 2 makes that harmless.

| Scenario | Result |
|---|---|
| Healthy config, 9 provider API keys in env | only `genai-claude` + `genai-gemini` |
| `models.yml` unparseable, 9 keys in env | "No models available" |
| `models.yml` unparseable, no disable list, key in env | **26 `anthropic` models** — the hole this closes |

**Residual risk:** if `config.yml` is deleted or corrupted **and** a provider key
is in the environment, built-ins return. Config is the only mechanism enforcing
this — a deliberate stopping point, since the goal is that no non-gateway model
is reachable in normal use, not a hardened boundary.

Ruled out: a source-level allowlist in `getDisabledProviderIdsFromSettings()`.
It works and is config-independent, but costs 58 test failures
(`model-discovery.test.ts` 67 pass → 15 pass / 52 fail, plus 6 across
`model-registry*`) because the suite legitimately exercises many provider ids.

### The in-app model picker

The browsable list is `buildBrowserItems(registry.getAvailable())`
(`modes/components/model-picker.ts:152`, `:163`), and `getAvailable()` filters by
`disabledProviders`. `omp models` calls the same method (`cli/models-cli.ts:175`),
so its output is a faithful stand-in for the picker.

`registry.getAll()` — the unfiltered catalog — is used at `:159` for **role chips
only**.

That is the one way a public model can re-enter the picker: configured model
roles resolve against the unfiltered catalog (`model-browser.ts:88`,
`catalog = [...allModels]`), so a role pointed at a built-in id would appear as
an `@role` row even though the provider is disabled. **One role is configured** —
the setup wizard set `modelRoles.default: genai-claude/aws:anthropic.claude-opus-5`,
which is on the gateway and therefore fine. Do not point a role at a non-gateway
provider.

Not covered by choice: explicit `--model anthropic/…` bypasses
`disabledProviders` entirely — the list governs listing, not direct addressing —
and fails only when no credential resolves.

## MCP servers: import restricted to OMP-native sources

Found by accident from an advisor smoke test. omp imports MCP servers from other
tools' configs — Claude Code (`~/.claude.json`, `~/.claude/plugins/`), Cursor,
VS Code, Codex, Gemini CLI, opencode, Windsurf. **That import is not gated by
`disabledProviders`.** With `claude` disabled, omp was still loading Claude Code
plugin MCP servers on every run and contacting one over the network:

```
error  MCP tool load failed  path=mcp:radar:radar-mcp-server
       HTTP 401: {"error":"unauthorized","error_description":"Bearer token required"}
debug  MCP prompt commands refreshed  path=mcp:portola:portola
```

Worse, both were already listed in Claude Code's own `disabledMcpServers` — omp
does not honor that list, so it **re-enabled servers that had been switched off
elsewhere**. The cause is a naming mismatch: Claude Code keys them
`plugin:radar:radar-mcp-server`, while omp namespaces plugin servers as
`${plugin}:${serverName}` → `radar:radar-mcp-server`
(`discovery/claude-plugins.ts:569`).

Fixed at the source with a provider allowlist in `mcp/config.ts`, in the
`includeServer` filter that already existed for project-scope exclusion:

```ts
const NATIVE_MCP_PROVIDERS = new Set(["mcp-json", "native", "omp-plugins", "agent-plugins"]);
```

Twelve discovery modules register MCP providers; the eight foreign ones
(`claude`, `claude-plugins`, `codex`, `cursor`, `gemini`, `opencode`, `vscode`,
`windsurf`) are now dropped before deduplication. `~/.omp/agent/mcp.json`,
`.omp/mcp.json`, root `mcp.json`, and OMP/agent plugins still work normally.

Verified: MCP log lines go from 2 to 0 per run with `mcp.json` empty — the
allowlist alone carries it.

### Why not the documented denylist

`disabledServers` in `~/.omp/agent/mcp.json` is the documented control and it
does work (`mcp/config.ts:123`), but it is **name-based**, so it only ever fixes
servers already known — anything installed in another tool later appears
silently. The allowlist is the wholesale switch the settings surface does not
offer.

Two traps hit while trying the denylist first, both worth remembering:

- **Names must be the namespaced form.** `"radar"` and `"radar-mcp-server"` are
  both silently ineffective; only `"radar:radar-mcp-server"` matches.
- **`mcp.json` is `additionalProperties: false`.** A `$comment` key makes the
  whole file fail validation and be skipped with no error — the third appearance
  of this silent-skip pattern today, after `disabledProviders` in `models.yml`
  and the missing `cost.cacheRead`/`cacheWrite` fields.

### Native config is unaffected — verified

Only *import from other tools* is blocked. Direct setup in omp works normally.
Confirmed with a throwaway entry in `~/.omp/agent/mcp.json`:

```json
{ "mcpServers": { "omp-native-probe": { "command": "/bin/echo", "args": ["probe"] } } }
```

omp read the file, the allowlist admitted it, and it attempted to spawn and
connect — `MCP tool load failed path=mcp:omp-native-probe — Transport closed`,
which is the correct outcome for a command that exits immediately. So
`~/.omp/agent/mcp.json`, `.omp/mcp.json`, root `mcp.json`/`.mcp.json`, and
OMP/agent plugin servers all still load.

`gantry` was the only imported server plausibly worth keeping (a local stdio
binary, declared in Claude Code, opencode, *and* Gemini CLI configs). It is now
excluded with the rest; add it under `mcpServers` when wanted, which is the right
place for something deliberately chosen.

## Discovery providers: Claude Code and opencode off

`disabledProviders` is one namespace shared by two unrelated subsystems. Besides
the 64 model providers and 3 implicit local engines, it also disables
**discovery providers** — the config-source adapters
(`native`, `claude`, `codex`, `gemini`, `opencode`, `github`, `agents`,
`agents-md`). 68 entries total.

`claude` and `opencode` are disabled, so omp does not read `~/.claude/CLAUDE.md`,
`<cwd>/.claude/**`, or opencode's `AGENTS.md`. Disabling a discovery provider is
heavier than it looks: it also drops that source's MCP servers, slash commands,
skills, hooks, tools, and settings — which is the intent here.

`opencode` was already covered incidentally: it is *also* a model-provider id in
the bundled catalog, so the generated model list happened to include it. It is
now listed deliberately rather than by accident.

Verified with a positive control: with `claude` re-enabled through a `--config`
overlay, omp reports a phrase from `~/.claude/CLAUDE.md`; with it disabled, it
does not.

## System prompt: partitioned

Split on one line: **SYSTEM.md describes how to operate the harness; AGENTS.md
says what to do with it.** Facts about the machine stay; anything prescribing
engineering behavior is the operator's to supply.

This replaced an earlier round of line-by-line removals. Sniping individual
`NEVER` lines did not converge — the harness prompt and the generated `AGENTS.md`
are two documents by different authors with different theories, so each cut
exposed another conflict. The disagreement was concentrated on a single axis:
**whether talking to the user is work or failure.** omp said failure, in five
places across four layers.

`system-prompt.md`: 252 → 153 lines, 2185 → 1089 words, 37 hard absolutes
(20 NEVER + 17 MUST) → 17, all now taking an artifact as their predicate.

### The default interactive path is exactly six files

`system-prompt.ts:19-26` imports them; everything else under `prompts/` is mode-,
tool-, or role-scoped.

| File | Disposition |
|---|---|
| `system-prompt.md` | Partitioned |
| `project-prompt.md` | Second `<critical>` block removed |
| `active-repo-context.md` | Clean — git-repo detection only, and conditional |
| `computer-safety.md` | **Kept.** Safety guardrails, and it *supports* chat-first: "Confirm immediately before external side effects" |
| `custom-system-prompt.md` | Clean — context files, git snapshot, skills, rules, redaction. Only renders under `SYSTEM.md` |
| `personalities/default.md` | **Disabled via config** — see below |

### The personality block was live

`system-prompt.ts:611` defaults `personality = "default"`, so
`personalities/default.md` rendered into every session even with nothing
configured. It is pure operator-domain: tone rules, a prescribed
`Problem: / Decision: / Check: / Next:` output template, and stock phrasing
patterns. The fixed response skeleton is the worst part — a template invites
being performed rather than used.

Fixed **in config, not source**: `personality: none` is a supported enum value
(`settings-schema.ts:1268`) that omits the block entirely. No repo edit.

### Kept — harness-mechanical

`<system-conventions>`, the harness-naming ROLE line, terminal rendering
capabilities (LaTeX, mermaid), `# Skills & Rules`, `# Internal URLs`, tool
inventory, `# Computer Use`, `# xd:// Tool Devices`, `# Tool I/O`,
`# Specialized Tools`, `# AST`, the `{{#if personality}}` injection point, and
from `# General`: retry-narrow-lookups, parallelize-independent-calls, the
`parallel` keyword → `task` mapping, and the destructive-action guard.

Rescued out of removed sections because they are mechanical: re-read on
staleness, and the todo round-trip batching rule.

`# Delegation` distilled to its mechanical core — subagents never see the
conversation (so assignments must be self-contained), the batching shape, the
concurrency cap, and the `hub` channel.

### Removed — operator-domain

`# Engineering Principles`, all of `EXECUTION WORKFLOW` (Scope, Research Before
Editing, Decompose, Implement, Verify, Cleanup), all of `DELIVERY CONTRACT`
(`<contract>`, `<completeness>`, `<evidence-and-output>`, `<yielding>`), the
`# Exploration` section, the delegation *preference* text and
`## Delegation gates` prose, and the trailing `<critical>` (session-limit
narration).

From `project-prompt.md`, a second `<critical>` block reasserting the same
directives in different words — which is why a phrase-level grep missed it:

- "Each response MUST advance the task. There is no stopping condition other than completion."
- "You MUST default to informed action; do not ask for confirmation when tools or repo context can answer."
- "You MUST verify the effect of significant behavioral changes before yielding."

`project-prompt.md` otherwise stays: workstation block, context-file delivery,
nested-rules notice, workspace tree, and "NEVER grep/glob for AGENTS.md — the
relevant ones are already in context" are all mechanical.

Also cut, because they leak into ordinary fan-out use: `orchestrate-notice.md`
rule 1 "NEVER yield until everything is closed" (rules renumbered 1–9) and the
`workflow-notice.md` stopping-point line.

One softened rather than removed: `NEVER yield non-trivial work without proof` →
`NEVER **claim** non-trivial work is done without proof`. The general repair for
this class is to move the absolute off a decision point and onto an observable
output.

### Sweep results — do not redo these

Swept every prompt file under `packages/coding-agent/src/prompts/` (161 files)
for each removed class:

| Class | Result |
|---|---|
| never-stop / never-ask | Default path clean. Remaining hits are mode/role-scoped (below). |
| anti-exploration (read-minimally) | Clean. Two hits, both mechanical tool descriptions (`checkpoint` context cost, `inspect_image` over `read`). |
| anti-re-audit / don't-verify | Clean. Only hit is `goals/goal-mode-active.md`, which *requires* auditing before claiming completion. |
| execution-workflow | Clean. Zero hits outside `system-prompt.md`. |
| delivery-contract | Four benign: "distinguish observations from inferences" grounding conventions in web-search and image prompts, and a clean-cutover default in `plan-mode-active.md`. The fifth, in `advisor/system.md`, was **not** benign — see [advisor.md](lode/local-build/advisor.md). |

The `advisor/system.md` verdict was wrong on first pass. It was classified as a
mode/role-scoped hit like `agents/`, on the reasoning that such contexts have no
user to return to. That reasoning does not hold for a reviewer: the advisor's
whole output is addressed to an agent that *does* have a user, so operator-domain
doctrine there **inverts** rather than applies. Corrected when the advisor was
actually read.

### Conditional runtime injections — a separate surface

25 fragments are injected **at runtime** by event or setting, not assembled into
the system prompt, so sweeping the assembled prompt does not reveal them. The
first audit pass missed this class entirely by treating "not in the six
prompt-build files" as "mode-scoped."

Most are mechanical or well-behaved; three are actively good. One live-by-default
injection conflicted and was amended: `thinking-loop-redirect.md` told the model
to "pick the most boring viable option and act; do not deliberate further" with
no exit that ends the turn, against a doctrine where a degenerating loop is a
stop-and-surface signal. It now permits stating the impasse, or reporting that
the approach does not fit, as valid endings.

Full inventory, triggers, and defaults:
[`lode/local-build/conditional-injections.md`](lode/local-build/conditional-injections.md).

### Mode-scoped directives left alone deliberately

Plan mode, goal mode, orchestrate mode, the subagent prompt, and the role prompts
under `agents/` still carry "keep going until complete." **That is correct for
them**: a subagent or a goal-mode loop has no user to return to, so returning is
not an available ending. Chat-first applies to the default interactive path,
which is what was partitioned.

`agents/` holds eight role prompts with their own engineering opinions. Injected
only when those agents are spawned; **not swept**.

### Consequences to know about

- `eagerTasks`, `eagerTasksAlways`, `useCodexTaskPrompt`, and `scoutAvailable`
  no longer change the main prompt. Those settings are effectively inert.
- The `xd://report_issue` block is still present but never renders — wrapped in
  `{{#if autoQaEnabled}}` and `dev.autoqa` is false.

### Why this is a repo edit and not `SYSTEM.md`

`SYSTEM.md` cannot express a removal. It **replaces** the default template
(rendering `custom-system-prompt.md` instead of `system-prompt.md`), and its
contents are explicitly **not compiled as Handlebars** — so copying the default
in to delete lines would emit literal `{{#has tools "ast_edit"}}` text and lose
all 88 conditionals. `APPEND_SYSTEM.md` can only add. Subtraction has to happen
in the bundled file.

### Verification

Handlebars blocks balance by stack check (18 `if`, 15 `has`, 4 `each`, 1 each of
`list`/`ifAny`/`when`; nothing unclosed). Checked against the *assembled* prompt,
not the source: a `-p` probe confirms no stopping-condition, informed-action,
never-yield, or load-only-what's-necessary directive survives in any wording,
while the Tool Inventory still renders.

## Output limits are measured, not inherited

opencode carried `limit.output: 8192` on every model as an acknowledged guess.
Measured against the bridge by sending `max_tokens: 999999` and reading the
`ValidationException` ceiling:

| Model | Ceiling | `maxTokens` set |
|---|---|---|
| opus-5, opus-4-8, opus-4-7, opus-4-6 | 128,000 | 64,000 |
| sonnet-5, sonnet-4-6 | 128,000 | 64,000 |
| opus-4-5, sonnet-4-5, sonnet-4 | 64,000 | 64,000 |
| **opus-4-1** | **32,000** | **32,000** |
| haiku-4-5 | 200,000 | 64,000 |
| claude-3-sonnet, claude-3-haiku | bridge clamps | 4,096 |
| gemini text | 65,536 | 65,536 |
| gemini image | — | 8,192 |

`opus-4-1` is the trap: its ceiling is below the 64,000 used elsewhere, so a
blanket value is a hard 400 on every request to it.

This matters beyond output length — omp derives Anthropic thinking budgets as
`maxTokens / 3` (`config/model-discovery.ts:136`), so 8,192 would have capped
thinking near 2,700 tokens. At 64,000 the budget is ~21,000.

The claude-3 pair is set to Anthropic's real 4,096 rather than a probed value:
the bridge silently clamps for them instead of rejecting, so probing does not
reveal their limit.

Unlike opencode, omp classifies Opus 5 correctly as adaptive
(`low,medium,high,xhigh,max`) — it lacks opencode's `anthropicOpus47OrLater`
regex bug that requires a minor version.

## Native addon

Required — `omp --version` works without it, but `omp models` and the TUI do not.

Building from source needs `bazelisk`, which is not installed. This build uses
the published prebuilt. Note the `.node` ships in a **platform-specific**
package, not the main one, and `bun install @oh-my-pi/pi-natives` fails with a
dependency loop because it is a workspace package:

```bash
cd /tmp && npm pack @oh-my-pi/pi-natives-darwin-arm64@17.2.11
tar xzf oh-my-pi-pi-natives-darwin-arm64-17.2.11.tgz
cp package/pi_natives.darwin-arm64.node <repo>/packages/natives/native/
```

`packages/natives/native/` is gitignored, so the 144MB binary stays out of the
branch. Version skew is one patch (prebuilt `17.2.11` vs source `17.2.12`); the
only natives commit between them is a Linux-only build fix, and the addon loads
and runs correctly.

### What the verification found

No HTTP client crate anywhere in `crates/` — no `reqwest`, `hyper`, `ureq`, or
`curl`. Scanning the shipped binary:

- **No telemetry endpoints.** All 119 embedded URLs are crate bug trackers
  (clap, getrandom, inferno), spec namespaces (SVG/MathML/SOAP), and static
  corpora for syntax highlighting and output filtering (`rtk-ai/rtk` filters,
  tldr pages, Sublime syntax docs).
- **It does import `_socket`, `_connect`, `_getaddrinfo`, `_send`, `_recv`.**
  Consistent with Rust's `std::net` always being linked plus vendored WebRTC
  media code — which also explains the CoreMedia/AVFoundation linkage.
- Links `DeviceCheck` and `CloudKit`, which read oddly for a compute addon;
  transitive Apple framework linkage is the likely cause.

Residual risk accepted: absence of endpoints in `strings` is not proof of absence
of capability. A source build is the only way to close that.

## Tests invalidated by the changes

18 tests marked `.skip`, each with a comment naming the cause. None were failing
for any other reason, and nothing else regressed.

| File | Skipped | Cause |
|---|---|---|
| `coding-agent/test/tools/report-tool-issue.test.ts` | 10 | `resolvePushConfig()` returns null |
| `catalog/test/litellm-provider.test.ts` | 4 | no `catalog.stencil.so` fetch |
| `catalog/test/siliconflow-provider.test.ts` | 2 | no `catalog.stencil.so` fetch |
| `catalog/test/issue-6563-repro.test.ts` | 1 | no `catalog.stencil.so` fetch |
| `coding-agent/test/system-prompt-inventory.test.ts` | 1 | delegation-gates prose removed |

Skips are deliberately per-test, not per-block. An initial `describe.skip` on
`flushGrievances` silently disabled 7 tests that still passed; narrowing to
individual cases kept 11 live ones covering `isAutoQaEnabled` precedence, the
consent veto, and the skip-when-no-endpoint paths.

Catalog package baseline is 558 pass / 1 fail on clean upstream; with these
changes 551 pass / 7 skip / 1 fail — same total, no new failures. That 1 failure
is **pre-existing and environmental**: a fixture that binds `127.0.0.1` cannot
listen in this sandbox. Confirmed by stashing and re-running, not assumed.

## Build, run, and PATH

```bash
# Prerequisites: bun 1.3.14 exactly (matches packageManager)
cd ~/projects/oh-my-pi
bun install

# Native addon — see above, or `bun run build:native` with bazelisk installed

# Put `omp` on PATH (symlink into this repo)
sh scripts/link-omp.sh
```

`bun run setup` cannot be used as-is: its `build:native` step fails without
bazelisk.

`link-omp.sh` symlinks `~/.bun/bin/omp` → `packages/coding-agent/scripts/omp`.
Use that wrapper, **not** `bun link`: Bun evaluates `bunfig.toml` `preload` from
the *current* directory, so a bun-shebang shim would execute an unrelated
project's preload whenever `omp` ran inside it. The wrapper launches Bun from an
empty bunfig-free directory and restores the real cwd internally.

Because it is a symlink into the repo, `omp` tracks the working tree — edits take
effect immediately, and it breaks if the checkout moves. Remove with
`rm ~/.bun/bin/omp`.

Running from source directly also works:

```bash
bun packages/coding-agent/src/cli.ts models
bun packages/coding-agent/src/cli.ts -p "prompt" --model genai-claude/aws:anthropic.claude-sonnet-5
```

`bun install` rewrites every `bun.lock` resolution URL to the internal
`npm.apple.com` mirror — 1138 lines of churn with identical integrity hashes.
Always `git checkout -- bun.lock` rather than committing it; it is noise that
fights rebases and embeds an internal hostname.

`bun install` also runs `prepare` → `gen:tool-views`, regenerating
`packages/coding-agent/src/export/html/tool-views.generated.js`. Gitignored.

### `omp -p` hangs without stdin — always redirect

`omp -p` has a `readPipedInput` startup phase that blocks until stdin reaches
EOF. From a terminal that is instant; from a script, CI job, or any context where
stdin is an open pipe that never closes, **it hangs indefinitely** — no output, no
log file written, no timeout of its own. This cost three multi-minute stalls
before it was diagnosed, and it masquerades as a hang in whatever you last
changed.

Always redirect:

```bash
omp -p "prompt" < /dev/null
```

The only clue it gives is a message after ~50s: `Still starting after Ns —
phase: readPipedInput`. `PI_DEBUG_STARTUP=1` streams phase markers. Prefer
bounding non-interactive runs (background + poll + hard kill) over a long
tool timeout, so a stall fails in seconds instead of minutes.

## genai-bridge

- **URL:** `http://localhost:11211`, no auth (localhost only)
- **Management:** `genai-bridgectl {start|stop|status|restart}`
- **Endpoints used here:** `/api/anthropic/v1/messages`,
  `/api/gemini/v1/publishers/google/models/<id>:generateContent`
- **Model listing:** `GET /api/tags` — advertises 78 models and is **not**
  trustworthy for serving capability or context limits
- Accepts full ids (`aws:anthropic.claude-opus-4-6-v1`) and short form
  (`claude-opus-4-6`)
- Multiplexes backends per model: most ids answer from Bedrock (`msg_bdrk_…`),
  but `opus-4-1` and `sonnet-4` route through Vertex
  (`*-aiplatform.googleapis.com`)
- `curl --noproxy localhost` is blocked by a local security hook; plain `curl` to
  localhost works

## Verified

- `omp models` → exactly 24 models across the two gateway providers, no
  built-ins, holding with 9 provider API keys in the environment
- `-p` runs return correct text output on both `anthropic-messages` and
  `google-generative-ai` routes, from PATH and from source. **Tool calling** is
  verified on `anthropic-messages` and on `gemini-2.5-flash`; gemini-3 models
  return an empty response for omp's tool-using requests (see
  [advisor.md](lode/local-build/advisor.md))
- Output ceilings probed for all 13 Claude ids and `gemini-3.5-flash`
- Claude-Code discovery off, with a positive control proving the probe
  discriminates
- Assembled system prompt carries no never-stop / never-ask / anti-exploration
  directive in any wording

## Not verified

- Interactive TUI beyond initial setup — the picker's *data source* is verified
  (`getAvailable()`, the same method `omp models` uses) but the rendered TUI is not
- Runtime confirmation of zero non-localhost traffic — the argument is source
  audit plus binary scan, not packet capture
- `agents/` role prompts, for operator-domain content
