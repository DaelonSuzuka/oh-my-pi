# Summary

`local-build` is a personal fork of `oh-my-pi` (`omp`, a coding agent) that
removes all outbound reporting. Unlike the parallel opencode fork, the provider
side needs no code changes: omp supports custom providers as first-class config
in `~/.omp/agent/models.yml`, so each machine runs its own providers. The source
diff is small and groups into: disabling every default-on outbound path
(auto-QA push to `qa.omp.sh`, the startup update check, marketplace auto-update,
the remote models.dev catalog fetch); restricting MCP import to OMP-native
discovery sources; stopping `functionCall.id` from reaching non-official Google
endpoints; enforcing a `concern` severity floor on the advisor; and marking
harness-generated messages so they are not read as operator input. A parallel set
of prompt edits partitions the built-in system prompt so it covers operating the
harness and nothing else, leaving behavioral doctrine to `AGENTS.md`. The build
runs from source under bun; the Rust native addon is currently the published
`17.2.11` prebuilt rather than a source build, because that needs a bazelisk
toolchain.

> **Per-machine provider config:** the genai-bridge gateway
> (`localhost:11211`, two keyless `genai-claude` / `genai-gemini` providers, 24
> models, all built-ins and discovery providers disabled in `config.yml`) is
> the **work laptop (mbp2)** configuration, verified there. Other machines run
> the same fork with different providers in `models.yml` / `config.yml`. The
> machine-independent parts of the fork are the source edits and the prompt
> partition; the provider wiring is per-host config.
