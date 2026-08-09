# Lode Map

Project memory for the local `omp` build. The authoritative build record is
[`../omp-local.md`](../omp-local.md) at the repo root — it holds the telemetry
diff, provider config, measured limits, and build steps. The lode adds the
index, the open work, and the rebase procedure.

| File | Contents |
|---|---|
| [summary.md](summary.md) | One-paragraph snapshot of what this fork is |
| [roadmap.md](roadmap.md) | Vetted open work items |
| [todos.md](todos.md) | Unvetted one-liners |
| [local-build/rebase-checklist.md](local-build/rebase-checklist.md) | What to re-verify after pulling upstream |
| [local-build/advisor.md](local-build/advisor.md) | Advisor config, why its prompt was partitioned, and the model bake-off |
| [local-build/conditional-injections.md](local-build/conditional-injections.md) | The 25 runtime-injected prompt fragments, their triggers, and which ones matter |
| [tmp/](tmp/) | Session scraps, gitignored |

## External

- [`~/projects/opencode/opencode-local.md`](../../opencode/opencode-local.md) —
  the same treatment applied to opencode. Source of the live-verified bridge
  model list and the record of which advertised ids do not serve.
