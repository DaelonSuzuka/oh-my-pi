# Summary

`local-build` is a personal fork of `oh-my-pi` (`omp`, a coding agent) that
removes all outbound reporting and routes every model request through the local
genai-bridge proxy on `localhost:11211`. Unlike the parallel opencode fork, the
provider side needs no code changes: omp supports custom providers as
first-class config in `~/.omp/agent/models.yml`, so the source diff is confined
to telemetry — 3 files, 24 lines, disabling auto-QA push to `qa.omp.sh`, the
startup update check, marketplace auto-update, and the remote models.dev catalog
fetch. Model routes are two keyless providers (`genai-claude` via
`anthropic-messages`, `genai-gemini` via `google-generative-ai`) carrying 24
live-verified models, with all 64 bundled catalog providers and 3 implicit local
engines disabled. The build runs from source under bun; the Rust native addon is
currently the published `17.2.11` prebuilt rather than a source build, because
that needs a bazelisk toolchain.
