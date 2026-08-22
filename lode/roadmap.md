# Roadmap

Active work items for the local build. Purpose and goals only — detail belongs
in `plans/` or a domain file.

## Sweep the `agents/` role prompts

**Constraint it answers:** the system prompt was partitioned on
harness-mechanical vs operator-domain, but `agents/` holds eight role prompts
(designer, scout, librarian, …) that carry their own engineering opinions and
were never swept.

Deferred deliberately — they inject only when those agents are spawned, and
current use is single-agent. This becomes real the moment subagents get used.

Note the partition does **not** apply wholesale here: a subagent has no user to
return to, so its "keep going until complete" is correct. What needs review is
the engineering-opinion content, not the never-stop framing.

## Build natives from source

**Constraint it answers:** the audit currently ends at a binary we did not
compile. `strings` found no telemetry endpoints, but the addon does import
`_socket`/`_connect`/`_getaddrinfo`, and absence of endpoints in a scan is not
absence of capability.

Needs `brew install bazelisk` plus a first Bazel build across 8 crates. Also
removes the version-skew risk of running a `17.2.11` addon against `17.2.12`
source.

## Exercise the interactive TUI

Initial setup has been run. The picker's *data source* is verified
(`getAvailable()`, the same method `omp models` uses), but the rendered TUI is
not — including whether the auto-QA consent dialog still appears now that the
push path is dead.

## Not doing: OS-level egress blocking

Considered and explicitly declined. The goal is not a hardened boundary against
a determined path out — it is that no non-gateway model is reachable in normal
use, specifically in the in-app model picker. That is satisfied by
`disabledProviders` in `config.yml`; see `omp-local.md`.

Also ruled out: a source-level provider allowlist in
`getDisabledProviderIdsFromSettings()`. It works and is config-independent, but
costs 58 test failures because the suite legitimately exercises many provider
ids (`model-discovery.test.ts` 67 pass → 15 pass / 52 fail). The damage exceeds
the risk it closes.

Accepted consequences of stopping here:

- `--model anthropic/...` still addresses a built-in directly, failing only for
  want of a credential. `disabledProviders` governs listing, not addressing.
- A configured model role pointing at a built-in id would surface as an `@role`
  row in the picker, because roles resolve against the unfiltered catalog. The
  one configured role (`modelRoles.default`) is on the gateway.
- If `config.yml` is lost and a provider key is in the environment, built-ins
  return.

## Decide on `install-id`

`~/.omp/install-id` is still generated. All four of its consumers are on paths
this install does not use, so it is inert rather than harmful — but the file
exists and a future upstream consumer would pick it up automatically. Options:
leave it, or stub `getInstallId()` to a fixed value.


## Measure advisor dispatch overhead on ollama-cloud

**Constraint it answers:** raw ollama-cloud API latency for small models is
sub-100ms (gpt-oss:20b: ~87ms, gemma4:31b: ~65ms on mbp2), but `omp -p` adds
3–4s of harness overhead. The advisor dispatches in-process, not via `-p`, so
its overhead should be much lower — but it has not been measured. If the
in-process dispatch-to-response is under ~500ms, ollama-cloud small models
become viable advisor candidates for mbp2 (where the advisor is currently
disabled).

See `local-build/advisor.md` → "ollama-cloud latency" section for the raw
numbers. Next step: enable the advisor with `gpt-oss:20b` and time actual
`onTurnEnd` → advisory delivery.