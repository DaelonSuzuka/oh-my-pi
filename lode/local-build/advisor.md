# Advisor

The advisor subsystem attaches a second model to a session. It receives primary
transcript deltas *including reasoning*, has its own `Agent` and an isolated
`ToolSession` (id suffixed `-advisor`), and its only channel into the primary is
an `advise` call rendering `<advisory severity=…>` into the transcript. It is
never a peer — excluded from `hub`, `history://`, and collab; it cannot be
messaged or killed.

Full mechanics: `docs/advisor-watchdog.md`.

## Current configuration

| Setting | Value | Note |
|---|---|---|
| `advisor.enabled` | `true` | Upstream default is `false` |
| `modelRoles.advisor` | `genai-gemini/gemini-3.1-flash-lite` | Chosen on measurement, below |
| `advisor.syncBacklog` | `off` | Was `1`; dropped so it cannot add turn latency |
| `advisor.subagents` | `false` | Upstream default |
| `advisor.immuneTurns` | `3` | Upstream default |
| `~/.omp/agent/WATCHDOG.md` | present | Review priorities aligned to operator doctrine |

## Why its prompt was partitioned, and why the rule inverts here

`prompts/advisor/system.md` carried the doctrine the main prompt had just shed:

> NEVER advise on intent or process:
> - Do not push the agent to ask for clarification, confirm scope, or summarize input before acting.
> - Do not question whether the user's ask is clear enough.
> - Intent is the agent's domain; **it defaults to informed action**.

That last phrase is verbatim what was removed from `project-prompt.md`. Enabling
the advisor as shipped would install a watchdog whose explicit job included
suppressing clarification-seeking — reinstating the removed behavior through an
enforcement agent rather than a rule.

**The role-prompt exemption does not cover the advisor.** Mode and role prompts
(`plan-mode-*`, `goals/`, `subagent-system-prompt.md`, `agents/`) keep their
"keep going until complete" framing because those contexts have no user to return
to. A reviewer is the opposite case: its entire output is addressed to an agent
that *does* have a user, so operator-domain doctrine there **inverts** instead of
applying. This was misclassified as a benign role-scoped hit on the first sweep
and corrected only when the file was read.

### Removed

- The intent/process suppression block quoted above.
- The scope-policing block — "a large diff, wholesale rewrite, or expanding plan
  is NOT a problem by itself" contradicts the requirement that structural
  commitments appear in conversation before an edit introduces them.
- The trailing "clean cutover … is the correct default; treat it as such."

### Added, from operator doctrine

Concern triggers for: acting on a decision conversation has not settled; adapting
around resistance instead of surfacing it (weakened test, shim, parallel path,
special-cased input); and goal/diff drift.

### Kept deliberately

- The low-confidence bar — generic unease or intent ambiguity → stay silent.
- The backwards-compatibility noise filter.
- Cite-only-inspected-evidence, including the rule against asserting values for
  arguments hidden from the rendered transcript.
- "You are user-aligned: treat the user's word as truth, their frustration as
  justified, their stated requirements as binding" — already correct.

## Model choice was measured, not assumed

Same planted defect for every model: an agent renames a function, updates two of
three callers with the third visible in its own grep output, and declares "Types
check." Three runs each, via the gateway.

| Model | Latency | Caught | Severity | Note size |
|---|---|---|---|---|
| **gemini-3.1-flash-lite** | 0.92 / 1.19 / 1.25s | 3/3 | `blocker` | 25–39 tok |
| gemini-2.5-flash | 1.14 / 1.18 / 1.48s | 3/3 | `concern` | 25–38 |
| haiku-4-5 | 1.21 / 1.27 / 1.46s | 3/3 | `concern` | 45–49 |
| sonnet-5 | 1.93 / 1.99 / 3.33s | 3/3 | `concern` | 60–77 |
| gemini-3.5-flash | 2.55 / 2.59 / 2.60s | 2/3 | `concern` | one run truncated at 12 tok |
| gemini-3.1-pro-preview | 3.08 / 3.41 / 3.84s | 2/3 | `blocker` | — |
| opus-5 | 3.98 / 4.66 / 5.28s | 3/3 | `blocker` | 195–300 |

Latency decides whether advice can steer a live turn, and note size is a
recurring tax on the **primary** context, since accepted advisories are injected
there. `gemini-3.1-flash-lite` wins all three axes.

Caveats: the catch check is a keyword heuristic, so a `NO` may be a wording miss
rather than a real one. `gemini-3.5-flash` being consistently slower than
`2.5-flash` smells like bridge routing rather than capability. Only `opus-5`
caught the *second* defect — the unsupported "Types check" claim — which is a
real capability gap the latency table hides.

Scripts: `lode/tmp/advisor-bakeoff.sh`, `advisor-bakeoff-gemini.sh`.

## Observed behavior so far

Ran once, reasoned about the delta, and correctly stayed **silent** — so the
prompt edit did not make it noisy. It has never emitted an advisory, which means
the interesting path (a `concern`/`blocker` waking or steering a turn) is
untested.

Every finalized advisor turn is appended to `<session>/__advisor.jsonl`
regardless of whether the advice was delivered, so its reasoning is inspectable
after the fact.
