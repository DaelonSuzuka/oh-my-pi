# Conditional Injections

25 prompt fragments under `packages/coding-agent/src/prompts/system/` are injected
**at runtime**, triggered by events or settings rather than assembled into the
system prompt. They were missed by the first audit pass because that pass swept
the six files `system-prompt.ts` imports at prompt-build time and treated
everything else as mode-scoped. Event-triggered injections are on the default
path — they just fire later.

Sweep these separately from the system prompt. Grepping the assembled prompt does
not reveal them.

## Live by default

| Injection | Trigger | Verdict |
|---|---|---|
| `thinking-loop-redirect.md` | `model.loopGuard.enabled` (default **true**) | **Amended** — see below |
| `tool-call-loop-redirect.md` | same loop guard | Fine — explicitly permits "summarize findings and yield if complete" |
| `empty-stop-retry.md` | `retry.enabled` (default **true**), on an empty turn | Fine — guards a genuinely empty response, not a considered stop |
| `auto-continue.md` | `compaction.autoContinue` (default **true**), after compaction | Good — "if there is nothing left to do, say so briefly instead of inventing further work" |
| `mid-run-todo-nudge.md` | open todos mid-run | Mild — "otherwise just keep working" |
| `interrupted-thinking.md` | turn interrupted while thinking | Fine — continuity context |
| `resolve-device-reminder.md` | after a preview-producing tool | Mechanical |
| `xdev-mount-notice.md` | xdev tools mounted | Mechanical |
| `snapcompact-*.md` (5 files) | compaction | Mechanical |
| `ultrathink-notice.md` | multi-step task heuristic | Benign |

## Inert here

| Injection | Why inert |
|---|---|
| `unexpected-stop-retry.md` | `features.unexpectedStopDetection` defaults **false** |
| `gemini-tool-call-reminder.md` | Gemini-specific; default model is Claude |
| `manual-continue.md` | Only on an explicit user continue — see below |
| `prewalk-continue.md`, `plan-mode-tool-decision-reminder.md`, `workflow-notice.md`, `orchestrate-notice.md`, `subagent-yield-reminder.md`, `ttsr-*.md`, `autolearn-nudge-autocontinue.md` | Mode-, role-, or feature-scoped |

## The one real conflict: `thinking-loop-redirect.md`

Upstream's response to a detected loop was "pick the most boring viable option
and act; do not deliberate further" — with no exit that ends the turn. That
contradicts the investigation doctrine directly: a degenerating loop is supposed
to be a **stop-and-surface signal**
(`~/projects/prompts/global-prompt/fragments/05-investigation-and-filesystem.md`,
requirements 4–5).

Amended rather than deleted, because the guard itself is correct — near-identical
repetition is a genuine degenerate state that needs breaking. The amendment adds
the missing exits:

- deciding between options → act *or* state the impasse and end the turn
- the approach itself does not fit → say so with evidence and end the turn; "that
  is a valid ending, not a failure"
- closing line: "act, surface the blocker, or finish" (was "Act, don't re-plan")

## Left alone, with reasoning: `manual-continue.md`

It says "You NEVER pause to summarize progress, re-confirm the plan, or ask
whether to proceed — just continue." Read cold that is a never-ask directive, but
it only fires when the user has *explicitly* asked to continue, so it is honoring
a live instruction rather than overriding the operator.

"NEVER pause to summarize progress" still overreaches — continuing and giving a
status line are not exclusive. Judgment call; revisit if it bites.

## Notable: three are well-designed

Worth reading before assuming the whole class is hostile.
`autolearn-nudge-autocontinue.md` is the strongest — it tells the model the
injected turn is *not* a user reply, that "only the user can" approve a pending
action, and to "yield and wait for the user's next prompt." That is exactly the
right shape for an automated turn.
