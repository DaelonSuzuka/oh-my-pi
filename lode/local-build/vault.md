# Headless vault access

`vault://` has a configured filesystem-root mode so ordinary access does not
depend on the Obsidian desktop process. The live mbp2 configuration maps vault
name `vault` to `/home/daelon/vault` and selects it for the `_` active-vault
alias.

## Resolution

`vault.roots` is a name-to-absolute-path record and `vault.active` names one of
those entries. When at least one root is configured, configured roots are the
authoritative directory listing; OMP does not probe the Obsidian CLI merely to
discover additional vaults. Existing realpath, traversal, and symlink-escape
checks still contain every filesystem operation within the selected root.

| Operation | Obsidian closed |
|---|---|
| list configured vaults | filesystem-backed |
| read, write, list directories | filesystem-backed |
| vault info/counts | filesystem-backed |
| case-insensitive full-text search | `lode` CLI |
| case-sensitive search | Obsidian CLI required |
| backlinks, tags, tasks, properties, bases, daily note | Obsidian CLI required |

The system prompt continues to use its historical `hasObsidian` condition, but
that predicate now means usable vault access: an enabled configured root or an
Obsidian binary is sufficient.

## Search contract

The standalone `lode` CLI remains metadata-first:

```bash
lode search storage
```

Full text is explicit, bounded, machine-readable, and path-scopeable:

```bash
lode search --query='snapshot retention' --content \
  --under=lode/machines/cradle --json --limit=20
```

`--under` uses the project-relative paths printed by Lode commands and filters
before Markdown bodies are loaded. OMP maps `vault://vault?op=search&q=...` to
that interface for configured roots. `--query` prevents machine-generated query
text from being interpreted as a CLI flag. Results contain at most three
line-anchored snippets per file and 20 files by default; no persistent index or
daemon exists yet.

## Verification boundary

Focused Lode CLI tests preserve metadata search and cover content opt-in,
pre-load path scoping, bounded JSON, escaping-path rejection, and flag-shaped
queries. Focused OMP tests cover configured listing, `_` path resolution,
filesystem reads, and exact Lode search argv without invoking Obsidian.

A live source probe forced Obsidian resolution to `null` while loading the real
`~/.omp/agent/config.yml`; listing, `vault://_/Welcome.md`, and scoped search all
succeeded. The coding-agent workspace typecheck remains blocked by the existing
unrelated `catalog/src/provider-models/openai-compat.ts:139` error.
