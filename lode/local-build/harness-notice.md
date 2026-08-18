# Harness Notice Envelope

Custom and hook messages reach the model wrapped in a `<system-notice>` block so
the agent can tell harness output from something the operator typed.

Template: `packages/agent/src/compaction/prompts/harness-notice.md`.
Applied in `convertMessageToLlm` (`packages/agent/src/compaction/messages.ts`).

## The failure it fixes

An agent working in `~/projects/adp-jetbrains` answered a supervised-process exit
as if the operator had spoken to it. Reported over gantry mail, and reproducible
by reading the conversion path rather than by rerunning anything.

`hub op:start` exits produce `role: "custom"`, `customType: "launch-completion"`,
`attribution: "agent"` (`session/launch-completion.ts`). Every custom and hook
message converts to `role: "developer"`, and the Anthropic wire builder pushes
developer turns as `params.push({role: "user", content})`
(`packages/ai/src/providers/anthropic.ts`).

Upstream does have a marker: developer params are promoted back to a
mid-conversation `role: "system"` param. It is gated on four conditions, and the
exit notification fails two of them independently:

| Condition | Why it fails |
|---|---|
| `model.compat.supportsMidConversationSystem` | `catalog/src/compat/anthropic.ts` computes it as `official && …`, where `official` means the canonical `api.anthropic.com` host. Any gateway is non-official, so this is **false for every model on this install** |
| follows a user message | a supervised process exits asynchronously, so the preceding param is an *assistant* turn |
| last, or immediately before an assistant | — |
| text-only | — |

The second row is an upstream bug independent of our fork: an async notification
can never satisfy `followsUser`, so that message class is unmarkable **even on
first-party Anthropic**. The first row is ours, and it is broader — it costs the
marker for every developer message, including ones that would otherwise qualify.

**Forcing the flag on is not the fix.** `compat/anthropic.ts:145-148` records that
Bedrock, Vertex, Foundry and other compatible gateways *reject* mid-conversation
system roles. Our bridge routes to Bedrock, so `supportsMidConversationSystem:
true` in `models.yml` buys a 400 rather than a marker.

## Why `attribution` is the discriminator

It already exists, is already normalized, and was already being thrown away.

`normalizeCustomMessageAttribution` (`coding-agent/src/session/messages.ts`)
resolves anything other than an explicit `"user"` to `"agent"`, so undefined
means machine-originated and the envelope treats it that way.

Messages the operator really did author are `attribution: "user"` and are
intercepted *before* the default path — `isUserInvokedSkillPrompt` returns a real
`role: "user"` turn, collab prompts carry `attribution: "user"`, and steering goes
through `wrapSteeringUserMessage`, which is itself an envelope and the precedent
for this one. So everything reaching the wrapped branch is harness output by
construction.

The value then rides to the provider and dies there: `attribution` appears twice
in the whole of `anthropic.ts`, both times in comments about user-id cloaking. No
wire builder reads it.

## Constraint: the envelope is position-independent

`wrapSteeringForModel` carries a comment earned the hard way — wire bytes must be
a pure function of the message, never of its index. When only the trailing steer
was wrapped, the same persisted message went out enveloped as the tail and raw
once an assistant reply buried it, rewriting an already-cached prefix and busting
the provider prompt cache from that message onward.

The envelope therefore depends only on `customType` and `content`. A test asserts
this directly.

## Scope

- Text-free content (images only) is left alone rather than given a bare notice.
- Multiple text blocks are joined into one enveloped block; image blocks are
  appended unchanged, matching `wrapSteeringUserMessage`.
- `attribution: "user"` is passed through untouched.

## Verified

`packages/agent/test/harness-notice.test.ts` — 6 cases: agent-attributed wrap,
undefined-attribution wrap, user-attribution passthrough, block joining with
image preservation, no bare envelope for text-free content, position
independence.

End to end, the turn-clock hook (agent-attributed, so it takes the wrapped path):

```
$ omp -p 'Does the exact literal string `<system-notice type="clock">` appear
  anywhere in your context? Answer only YES or NO.' < /dev/null
YES
```

Asking the model to *quote* the clock line instead returns the sentence with no
tags, which reads as a missing envelope and is not one — models quote the payload
and drop the framing. Test for the literal string.

## One upstream test's locator was fixed, not weakened

`agent-session-before-agent-start-attribution.test.ts` located the injected
message by exact text equality, which the envelope breaks. Every assertion in
those three cases is on `attribution` and `inferCopilotInitiator`; the text is
only a finder. Changed `===` to `.includes(...)` in the helper. No assertion was
relaxed and nothing was skipped.
