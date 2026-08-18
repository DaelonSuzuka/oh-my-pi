# Rebase Checklist

Upstream `oh-my-pi` is active (v17.2.12 at fork point, frequent releases). The
local patches are easy to lose silently in a conflict resolution that takes
upstream's side. Run this after every `git pull` / rebase onto upstream.

> **Run every check in a freshly launched process.** `settings.ts` has no file
> watcher and there is no `/reload` for settings, so a running omp holds the
> in-memory `Settings` it built at launch. `/new` does not help, and neither does
> `/advisor` off/on — that rebuild re-resolves from the same stale object. A check
> that fails against a long-running process tells you nothing. Same for hooks under
> `~/.omp/agent/hooks/pre/`: loaded per process.

> **Redirect stdin from `/dev/null` for anything that spawns omp.** `-p` blocks in
> `readPipedInput` until stdin reaches EOF. This is not only about direct `omp -p`
> calls: the coding-agent **test suite** spawns them, so `bun test
> packages/coding-agent/test/` launched detached (no controlling terminal, stdin
> never closing) hangs indefinitely and prints `Still starting after Ns — phase:
> readPipedInput` forever. The same command run in the foreground completes. Append
> `< /dev/null` to the test command, not just to the probes in §5.

## 1. The two hard returns still return

`resolvePushConfig()` returns `null` with its body deleted;
`fetchWellKnownModels()` returns `{}` and keeps the upstream body below as
unreachable code. If a rebase resolves a conflict by taking upstream, the early
return disappears and the feature comes back on.

```bash
grep -n "LOCAL BUILD" packages/coding-agent/src/tools/report-tool-issue.ts
grep -n "LOCAL BUILD" packages/catalog/src/provider-models/openai-compat.ts
```

Expect one hit each.

## 2. The three defaults are still flipped

```bash
grep -A4 '"dev.autoqa"'             packages/coding-agent/src/config/settings-schema.ts
grep -A6 '"startup.checkUpdate"'    packages/coding-agent/src/config/settings-schema.ts
grep -A6 '"marketplace.autoUpdate"' packages/coding-agent/src/config/settings-schema.ts
```

Expect `false`, `false`, `"off"`. `~/.omp/agent/config.yml` sets the same three,
so the install stays quiet even if these revert — but do not rely on it.

**`config.yml`, not `settings.json`.** A hand-written `settings.json` is migrated
on first run and renamed `.bak`. The setup wizard rewrites `config.yml` and
strips comments, and it reorders keys — never append to that file blindly, or a
list item can land after a scalar key and produce invalid YAML that omp
quarantines to `config.yml.broken-*`. Prefer `omp config set`.

Also confirm the disable list survived a wizard run. It spans two kinds of id
sharing one namespace: the bundled **model** providers plus the implicit local
engines, and the foreign **discovery** providers that import config from other
agents' installs. The discovery ids are the ones that can silently reintroduce a
public model route, and they are a short fixed set, so check them by name:

```bash
omp config get disabledProviders --json | python3 -c "
import sys,json
have=set(json.load(sys.stdin)['value'])
disco={'claude','claude-plugins','codex','cursor','gemini','github','opencode'}
print('missing discovery ids:', sorted(disco-have) or 'none')"
```

`opencode` and `gemini` exist in both namespaces. The model-provider side is not
worth counting — §5 proves the outcome directly by showing which providers
actually route, and a new upstream provider shows up there as a new table row.

## 3. No new outbound paths appeared

The audit found exactly four default-on outbound paths. Re-run the sweep to
catch a fifth:

```bash
# Hostnames newly referenced in source
grep -rhoE "https?://[a-zA-Z0-9._-]+" packages/*/src | sort -u > /tmp/hosts.new

# Settings that gate network behaviour
grep -nE '"(startup|marketplace|dev)\.[a-zA-Z.]*"\s*:' \
  packages/coding-agent/src/config/settings-schema.ts
```

Known-benign categories: provider API endpoints (unreachable — every built-in
provider is disabled via `disabledProviders` in `config.yml`), package-registry
scrapers under `web/scrapers/`, and docs links.

Watch specifically for new members of these classes:

- anything under `*.omp.sh` (the project's own backends)
- `catalog.stencil.so` (the models.dev mirror) reappearing behind a new caller
- a new consumer of `getInstallId()` — `docs/install-id.md` lists the four that
  existed at fork point:

```bash
grep -rn "getInstallId" packages/*/src | grep -v "utils/src/dirs.ts"
```

## 4. OTEL is still opt-in

Export must remain gated on a standard `OTEL_EXPORTER_OTLP*_ENDPOINT` env var.
Check that `telemetry-export.ts` still returns early when no signal has an
endpoint, and that nothing in `main.ts` passes a telemetry config
unconditionally.

```bash
grep -n "signalConfig\|OTEL_SDK_DISABLED" packages/coding-agent/src/telemetry-export.ts
grep -rn "telemetry:" packages/coding-agent/src/main.ts
```

## 5. Config still validates and routes

```bash
bun packages/coding-agent/src/cli.ts models
```

Expect `genai-claude` and `genai-gemini`, and **no other providers**. A schema
error degrades to a warning and silently disables custom providers, so absence of
the table is the failure signal, not an error exit — check that models are listed
at all before checking which.

Then confirm both wire protocols still work. **Redirect stdin** — `-p` blocks in
`readPipedInput` until stdin reaches EOF, so from a script it hangs forever with
no output and no log:

```bash
bun packages/coding-agent/src/cli.ts -p "Reply with exactly: OK" \
  --model genai-claude/aws:anthropic.claude-sonnet-5 < /dev/null
bun packages/coding-agent/src/cli.ts -p "Reply with exactly: OK" \
  --model genai-gemini/gemini-3.5-flash < /dev/null
```

## 6. Native addon still loads

A minor version bump upstream may break ABI against the pinned `17.2.11`
prebuilt. If `omp models` fails to load the addon, pull the matching prebuilt
for the new version — or build from source once bazelisk is available.

## 7. Discard the lockfile churn

`bun install` rewrites every `bun.lock` resolution URL to the internal
`npm.apple.com` mirror (identical integrity hashes). Always
`git checkout -- bun.lock` before committing.

## 8. Every skip is still a local-build skip

Upstream may add tests for the push path, stencil.so enrichment, or the removed
prompt prose, which will fail rather than conflict — a new red test is the signal
to skip it and mark it.

Every `.skip` we introduced carries a `LOCAL BUILD` comment naming which change
made it fail, so the check is that the two sets match: no marked skip has lost
its marker, and no unmarked skip has appeared.

```bash
grep -rn "LOCAL BUILD" packages/*/test/ packages/*/test/**/ 2>/dev/null
grep -rn "\.skip(" packages/*/test/ packages/*/test/**/ 2>/dev/null
```

They cluster in the push path (`report-tool-issue`), the two OpenAI-compat
catalog providers plus `issue-6563-repro` (all reaching `fetchWellKnownModels`),
`system-prompt-inventory` (asserts the removed prose), and `advisor` (asserts a
`nit` is forwarded, which the severity floor now drops).

Conversely, if upstream *removes* the push path itself, the skips become
unnecessary — unskip rather than carrying them forever.

One catalog test fails on **clean upstream** too: a fixture cannot bind
`127.0.0.1` in this sandbox. That is environmental, not a regression — establish
the baseline on `main` before blaming a local change.

## 9. The system prompt is still partitioned

The cut line is **harness-mechanical stays, operator-domain goes**. Upstream adds
behavioral rules routinely, and they arrive in four different layers — a
phrase-level grep will miss paraphrases. Sweep by *class*, not by string:

```bash
cd packages/coding-agent/src/prompts
# never-stop / never-ask
grep -rniE "stopping condition|advance the task|ask for confirmation|informed action|before yielding|without asking|do not stop|keep going|same turn|not a (yield|stopping) point" .
# anti-exploration
grep -rniE "only what.s necessary|offset/limit|hope is not|avoid reading|minimi[sz]e (context|reads)" .
# anti-re-audit
grep -rniE "re-audit|THE verification|routine validation|do not re-?check" .
# delivery-contract / workflow
grep -rniE "\.Done. means|present unfinished|clean cutover|silently shrink|reuse existing patterns|fix problems at the source" .
```

Check **all six default-path files**, not just `system-prompt.md`
(`system-prompt.ts:19-26` lists them): `system-prompt.md`, `project-prompt.md`,
`active-repo-context.md`, `computer-safety.md`, `custom-system-prompt.md`,
`personalities/*.md`.

Also sweep **`prompts/advisor/system.md`**, which is not on the default path but
is not exempt either. See [advisor.md](advisor.md): a reviewer's output is
addressed to an agent that has a user, so operator-domain doctrine there inverts
rather than applies. Upstream restoring its intent-suppression block would
reinstate, through the watchdog, what the main prompt no longer says.

```bash
grep -nE "informed action|ask for clarification|police scope|clean cutover" \
  packages/coding-agent/src/prompts/advisor/system.md
```

Expect no hits.

`computer-safety.md` is safety, not opinion — keep it.

Hits inside `plan-mode-*`, `goals/`, `orchestrate-notice.md` (rules 2+),
`subagent-system-prompt.md`, and `agents/` are **expected and correct** — those
contexts have no user to return to. The advisor is the one review surface where
that reasoning does not transfer.

Verify against the assembled prompt, not the source:

```bash
cd /tmp && omp -p "Answer YES or NO only: do your instructions contain, in any wording, that there is no stopping condition other than completion?" < /dev/null
```

## 10. `personality` is still `none`

`system-prompt.ts` defaults it to `"default"`, which injects
`personalities/default.md` — tone rules and a prescribed output template. It is
suppressed by config, not by a source edit, so a settings reset re-enables it.

```bash
omp config get personality   # expect: none
```

## 11. MCP import is still restricted to native sources

`mcp/config.ts` carries a `NATIVE_MCP_PROVIDERS` allowlist inside `includeServer`.
Upstream imports MCP servers from eight foreign discovery modules, and that
import is **not** gated by `disabledProviders`. If the allowlist is lost in a
rebase, servers configured in Claude Code, Cursor, VS Code, Codex, Gemini CLI,
opencode, or Windsurf silently reappear — including ones disabled in those tools.

```bash
grep -n "NATIVE_MCP_PROVIDERS" packages/coding-agent/src/mcp/config.ts
cd /tmp && omp -p "reply OK" < /dev/null >/dev/null 2>&1
grep -cE '"message":"MCP' "$(ls -t ~/.omp/logs/omp.*.log | head -1)"   # expect 0
```

If a new native provider id appears upstream, add it to the set — otherwise
legitimately native servers get dropped silently.

## 12. Harness messages still arrive marked

`convertMessageToLlm` wraps agent-attributed custom/hook messages in the
`<system-notice>` envelope from `prompts/harness-notice.md`. Without it, harness
output reaches the model as unmarked `role: "user"` text and gets answered as if
the operator had spoken. Full mechanism in [harness-notice.md](harness-notice.md).

```bash
grep -n "wrapHarnessNotice" packages/agent/src/compaction/messages.ts
ls packages/agent/src/compaction/prompts/harness-notice.md
bun test packages/agent/test/harness-notice.test.ts
```

Two upstream changes would silently undo this:

- A rewrite of the `custom`/`hookMessage` case in `convertMessageToLlm` that drops
  the `attribution` branch. The conversion is shared with compaction, so a rebase
  conflict there is plausible.
- Relaxing `supportsMidConversationSystem` in `catalog/src/compat/anthropic.ts` to
  cover non-official endpoints. That would double-mark — the envelope *and* a
  `system` param. Harmless but redundant, and the envelope is the one to keep,
  since the promotion still cannot reach async notifications.

Verify against the real thing rather than the source, in a fresh process:

```bash
cd /tmp && omp -p 'Does the exact literal string `<system-notice type="clock">` appear anywhere in your context? Answer only YES or NO.' < /dev/null
```

Ask for the literal string, not a quotation — models reproduce the payload and
drop the framing, which looks like a missing envelope and is not one.

If upstream adds its own marker for this class, drop ours rather than stacking
them.
