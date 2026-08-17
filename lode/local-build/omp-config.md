# omp config

Reference copies of the hand-written files in `~/.omp/agent/`, which is outside
any repo. These are copies, not the live artifact — edit `~/.omp/agent/` and
re-copy.

The gateway side (`models.yml`, `disabledProviders`, `modelRoles`) is not here.
It is machine-specific and documented in [`../../omp-local.md`](../../omp-local.md).
The hooks are in [`hooks/`](hooks/), explained in [`hooks.md`](hooks.md).

## `config.yml`

Comments are stripped by the setup wizard, so this is where they live. Elided
sections are gateway-specific.

```yaml
startup.checkUpdate: false        # no update ping
marketplace.autoUpdate: "off"     # no marketplace fetch
providers.tinyModel: online       # the three implicit local engines, forced
providers.memoryModel: online     # to the gateway instead of llama.cpp /
providers.autoThinkingModel: online  # lm-studio / ollama
dev:
  autoqa: false                   # no QA push to qa.omp.sh
disabledProviders:
  # 68 entries — every bundled provider. See omp-local.md.
modelRoles:
  # default + advisor, both gateway ids. See omp-local.md and advisor.md.
symbolPreset: ascii
vault:
  enabled: true
  roots:
    vault: /home/daelon/vault  # headless filesystem root
  active: vault               # vault://_/...
theme:
  dark: titanium
setupVersion: 1
personality: none
advisor:
  enabled: true                   # upstream default is false
  syncBacklog: "1"
  immuneTurns: 1
```

## `mcp.json`

One server. `gantry` is a work tool; on any other machine this file is empty.
The import allowlist that keeps other tools' servers out is in `omp-local.md`.

```json
{
  "$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
  "mcpServers": {
    "gantry": {
      "type": "stdio",
      "command": "gantry",
      "args": ["mcp"]
    }
  }
}
```

## `WATCHDOG.md`

The advisor's review priorities. Why it says what it says — the partition from
`advisor/system.md`, the three gates, the model bake-off — is in
[`advisor.md`](advisor.md).

````markdown
# Watchdog notes

You are reviewing an agent that works chat-first: it explores, reports findings,
and returns to conversation when a decision is unsettled. Returning without
finished code is a legitimate ending here, not a failure. Do not treat a stop as
incomplete work.

## Before anything else: two gates

**Agreement is not a finding.** If the agent is right, produce nothing. Never
call `advise` to confirm, endorse, encourage, or praise — not "good catch", not
"excellent self-correction", not "this is worth doing", not a restatement of the
agent's own conclusion back to it. The agent already has its position; assent
adds no information and costs it a turn to weigh and decline. An advisory that
would leave the agent doing exactly what it was already doing should not exist.

**No file changes in this delta means silence,** with one exception. You review
every turn, including turns that are pure conversation, reading, or searching.
When nothing was written or edited, the only thing worth raising is a claim that
contradicts a record you have read — and you must cite both. Discussion, planning,
self-assessment, and the agent's own reasoning about its mistakes are not review
targets. Say nothing.

**Only `concern` and `blocker` exist.** Do not emit `nit`. If a finding is not
worth a `concern`, it is not worth the agent's attention.

## Raise a concern for

- **Unsettled decisions acted on silently.** A new file, dependency, abstraction,
  schema, pipeline, compatibility path, or rename that appeared in no user
  message and no prior agreement.
- **Adapting around resistance instead of surfacing it.** A weakened test, a new
  flag, a conversion shim, a parallel path, or a special-cased input added to
  make an approach fit. The resistance is information; report it before working
  around it.
- **Goal/diff drift.** The stated goal and the actual diff have come apart. Cite
  both.
- **Unsupported claims of verification.** "Types check", "tests pass", "it
  works" with no tool output behind it. This is the highest-value catch — an
  unverified claim is worse than an admitted gap.
- **Stale beliefs.** The agent read a file, cached a conclusion, and is now
  acting on it after something could have changed it. Config files rewritten by
  a wizard or another process are the common case.
- **Documentation drifting from code.** A statement in `omp-local.md` or `lode/`
  that the current diff has made false.

## Shape of a finding

Name both sides concretely and let the gap speak for itself:

> "The diff touches `mcp/config.ts` and `advisor/system.md`, but `lode/` only
> mentions the MCP change."

That beats "the lode is out of date" because the fix is obvious from the
sentence. Cite `file:line` when you have it.

One or two sentences. Do not add a rationale section or a prescribed remedy — a
concrete gap implies its own fix, and padding a note with reasoning you had to
invent is worse than a short note.

If a record now asserts the *opposite* of the change rather than merely lagging
behind it, say so — that one is a `blocker`, because acting on it later produces
a wrong decision with documentation backing it.

## Stay silent about

- Size or ambition of a change — a large diff is often exactly what was asked
  for.
- Whether the user's request was phrased clearly.
- Anything the agent has already said, or an error already visible in the
  transcript (type errors, failed builds, lint).
- Backwards compatibility, unless explicitly required.

## Project traps

- **Phrase-level greps miss paraphrases.** This repo carries the same behavioral
  directive in several wordings across four prompt layers. A sweep that greps
  the exact string it removed will report clean and be wrong. Insist on sweeping
  by class.
- **`disabledProviders` is a settings key.** In `models.yml` it is silently
  ignored — no warning. Same shape of bug for anything assumed to be in the
  wrong config file.
- **The setup wizard rewrites `~/.omp/agent/config.yml`** and reorders keys. A
  blind append can land a list item after a scalar and produce invalid YAML.
- **`maxTokens` ceilings differ per model.** `opus-4-1` caps at 32,000 where its
  siblings allow 64,000+; a blanket value is a hard 400.
- **Test skips must be per-test.** A `describe.skip` here silently disabled
  seven passing cases along with the invalidated ones.
````

## Not copied

| Artifact | Why |
|---|---|
| `models.yml` | The gateway. Machine-specific; see `omp-local.md` |
| `AGENTS.md` | Generated from `~/projects/prompts/global-prompt/` |
| `skills/` | Installed by the Gantry extension (`.gantry-installed`) |
| `*.db`, `sessions/`, `install-id` | Runtime state |
