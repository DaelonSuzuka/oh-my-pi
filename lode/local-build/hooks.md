# Hooks

Two hooks live at `~/.omp/agent/hooks/pre/`, outside any repo. Copies are kept in
[`hooks/`](hooks/) next to this file because that directory is not version
controlled anywhere and both took real iteration to get right. The copies are
reference, not the live artifact — edit `~/.omp/agent/hooks/pre/` and re-copy.

Discovery is `<configDir>/hooks/{pre,post}/`, per `discovery/builtin.ts`. The
filename becomes the capability's `tool` field, which is irrelevant for session-
and turn-scoped events; the factory's `pi.on(...)` calls are what bind.

## `load-lode.ts` — lode at the start of a new conversation

Puts the lode entry files in context once, at the start of a genuinely new
conversation, before the user's first turn. Fires on launching into a fresh
conversation and on `/new`. **Not** on resume, not per request, not per launch.

Files, in priority order: `lode/summary.md`, `lode/terminology.md`,
`lode/lode-map.md`, `lode/tmp/active.md`. The first three are the interpretive
frame — what this project is, what its words mean, what exists and where — and
they decide how the *first* sentence is read. `active.md` is state rather than
vocabulary, so it is last.

### Three wrong versions preceded it

**`session_start` + `pi.sendMessage`.** `session_start` fires once per *process
launch*, and omp resumes by default, so every launch appended another full copy.
Observed: three copies interleaved through an 8-message session. Not fixable at
that seam — `SessionStartEvent` is `{ type }` and nothing else, so it cannot tell
a new conversation from a resume. (`SessionSwitchEvent` *does* carry
`reason: new | resume | fork | handoff`, but it is only emitted on in-process
transitions, never at launch. So neither event suffices alone.)

**A 6000-char budget**, inherited from the shell original, where it existed
because Claude Code spools an oversized `additionalContext` to a file instead of
injecting it. omp has no such cap on this path. At 6000, gantry's 6144-char
`active.md` was silently omitted — the worst possible casualty for a hook whose
job is to say what is in flight. Now 40000, a backstop rather than a mechanism;
measured worst case across five real lodes is 27,628 chars.

**A `context` hook.** Rebuilding the payload before every LLM call fixed
duplication and staleness, but put volatile content at message index 0. omp
allows 4 cache breakpoints — up to 3 on system blocks, the rest anchoring a 1–2
message tail window — so a first message that changes mid-session cold-misses the
whole conversation behind it.

### What makes the current version work

`ctx.sessionManager.getEntries()`. An empty conversation is a new one, so both
events route through one guard and the pair is idempotent. Injecting once and
letting it persist makes the entry immutable for the life of the conversation,
which is what prefix caching wants. Fork and handoff fall through naturally,
since both begin with inherited content.

On the common path — launching into a resumed session — the hook does nothing.
It is a guard, not a worker.

Verified: fresh launch injects once; two `--continue` launches add nothing (1
lode entry, 3 user turns); a repo with no `lode/` is a silent no-op; and
"add a disentangler to the frombulation engine" parses with both terms cited from
`terminology.md` — the failure that started this, which was reading `lode` as a
misspelling of `load`.

**Not verified:** `/new`. It is a TUI slash command and cannot be driven from
print mode. The `session_switch` handler is wired to the same guard.

## `turn-clock.ts` — time of day, per turn

The prompt has no clock. `formatLocalCalendarDate()` returns `YYYY-MM-DD`,
`dateTime` is assigned that same value, and both are computed once at prompt build
(`system-prompt.ts:787`) — recomputed only when the system prompt is rebuilt on a
tool-set change, never per turn.

So a session opened last night reports yesterday's date and no hour for as long as
it stays open. Two agents concluded it was still last night and suggested going to
bed; it was 2PM the next day. That is a correct inference from the only temporal
fact they had.

`before_agent_start` fires after the user submits and before the agent loop, and
its result injects a persisted message. Each turn gets one stamp —
`Mon 2026-08-10 14:16 EDT`. Weekday and timezone are included because "is it
late?" needs both.

Each stamp is immutable once written, so it costs nothing in prefix caching. A
`context` hook was rejected for the same reason as above: one always-current clock
rewritten per call defeats the cache for everything behind it.

Verified against the wall clock, exact to the minute, with the agent correctly
citing the stamp over the system prompt's date.

### The date-only choice was deliberate, and half-finished

`dateTime` is a **dead template variable** — computed, passed into the render
data, consumed by no template. Only `{{date}}` is used, in `project-prompt.md`.
That is the fossil of a decision: someone had a datetime, reduced it to a calendar
date, and left the name behind.

The reason is almost certainly caching — the system prompt carries up to 3 of the
4 breakpoints, so a clock there would invalidate the most-cached region on every
rebuild, while a calendar date changes at most once per session. Claude Code makes
the same trade.

The gap is that the trade was only half-completed: time was correctly removed from
the cached region and never put anywhere else. If an upstream change ever wires
`dateTime` up to a template, it will quietly cost the system cache — that stub is
where to look if cache misses appear after a version bump.
