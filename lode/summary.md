# Summary

`local-build` is a personal fork of `oh-my-pi` (`omp`, a coding agent) that
removes all outbound reporting and routes every model request through the local
genai-bridge proxy on `localhost:11211`. Unlike the parallel opencode fork, the
provider side needs no code changes: omp supports custom providers as
first-class config in `~/.omp/agent/models.yml`. The source diff is small and
groups into: disabling every default-on outbound path (auto-QA push to
`qa.omp.sh`, the startup update check, marketplace auto-update, the remote
models.dev catalog fetch); restricting MCP import to OMP-native discovery
sources; stopping `functionCall.id` from reaching non-official Google endpoints;
enforcing a `concern` severity floor on the advisor; and marking
harness-generated messages so they are not read as operator input. A parallel set
of prompt edits partitions the built-in system prompt so it covers operating the
harness and nothing else, leaving behavioral doctrine to `AGENTS.md`. Model routes
are two keyless providers (`genai-claude` via `anthropic-messages`, `genai-gemini`
via `google-generative-ai`) carrying live-verified models, with the bundled
catalog, the implicit local engines, and the foreign discovery providers all
disabled in `config.yml`. The build runs from source under bun; the Rust native
addon is currently the published `17.2.11` prebuilt rather than a source build,
because that needs a bazelisk toolchain.
