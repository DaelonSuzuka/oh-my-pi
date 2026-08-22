/**
 * Put the lode entry files in context at the start of every new conversation,
 * before the user's first turn.
 *
 * Fires on exactly two things:
 *   - launching omp into a fresh conversation (not a resume)
 *   - `/new` within a running process
 *
 * Not on resume, not per request, not per process launch.
 *
 * ── Why it is shaped this way ────────────────────────────────────────────────
 *
 * `session_start` alone is wrong: it fires once per *process launch*, and omp
 * resumes by default, so it appended a fresh copy on every start — three copies
 * interleaved through an 8-message session, observed. `SessionStartEvent` is
 * `{ type }` and nothing else, so it cannot tell a new conversation from a
 * resume. The discriminator lives on `SessionSwitchEvent.reason`
 * (`new | resume | fork | handoff`), but that event is only emitted for
 * in-process transitions and never at launch. So neither event is sufficient
 * alone, and neither carries enough to dedupe.
 *
 * `ctx.sessionManager.getEntries()` is what makes it decidable: an empty
 * conversation is a new one. Both events therefore route through the same guard,
 * which makes the pair idempotent — whichever fires, the injection happens at
 * most once, and only into a conversation that has not started yet.
 *
 * A `context`-hook version was tried and rejected: it rebuilt the payload before
 * every LLM call, which fixed duplication but put volatile content at message
 * index 0. omp allows 4 cache breakpoints — up to 3 on system blocks, the rest
 * anchoring a 1-2 message tail window — so a first message that changes
 * mid-session cold-misses the whole conversation. Injecting once and letting it
 * persist makes the entry immutable for the life of the conversation, which is
 * what prefix caching wants.
 *
 * Fork and handoff deliberately fall through: both begin with inherited content,
 * so the emptiness guard skips them. A forked conversation already has the lode
 * from its parent.
 *
 * ── lode startup vs manual reads ────────────────────────────────────────────
 *
 * The hook shells out to `lode startup` when the CLI is available, so the file
 * list, budget, and formatting stay owned by the CLI rather than drifting in
 * the hook. The manual file-reading path remains as a fallback for machines
 * where `lode` is not installed.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { HookAPI, HookContext } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

/**
 * Read order is priority order. The first three are the interpretive frame —
 * what this project is, what its words mean, what exists and where — and they
 * decide how the *first* sentence of a conversation is read. Injecting them is
 * what makes "add a disentangler to the frombulation engine" parse instead of
 * being guessed at. `active.md` is state rather than vocabulary, so it is last.
 * Used only by the fallback path; `lode startup` owns its own list.
 */
const FILES = ["lode/summary.md", "lode/terminology.md", "lode/lode-map.md", "lode/tmp/active.md"];

/**
 * Backstop against a pathological file, not a mechanism that fires in normal
 * use. Measured worst case across five real lodes with all four files: 27,628
 * chars. The shell original's 6000 came from Claude Code spooling an oversized
 * `additionalContext` to a file rather than injecting it; omp has no such cap.
 * At 6000, gantry's 6144-char `active.md` was silently omitted.
 * Used only by the fallback path.
 */
const BUDGET = 40000;

const MARKER = "lode";

const PREFIX =
	"Project lode, loaded from disk at the start of this conversation. This is the current map of the project; check it against the code rather than trusting it.";

/** A conversation nobody has spoken in yet, and which has no lode entry already. */
function isFreshConversation(ctx: HookContext): boolean {
	let entries: Array<{ type?: string; customType?: string; message?: { role?: string } }>;
	try {
		entries = ctx.sessionManager.getEntries() as typeof entries;
	} catch {
		// Cannot tell; do nothing rather than risk a duplicate.
		return false;
	}
	for (const entry of entries) {
		if (entry.customType === MARKER) return false;
		if (entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role === "user" || role === "assistant") return false;
	}
	return true;
}

/**
 * Try `lode startup`; if the CLI is unavailable, fall back to reading the
 * known entry files directly. Either path returns the content to inject
 * and a status line for the log.
 */
function buildPayload(cwd: string): { content: string; status: string } | undefined {
	if (!fs.existsSync(path.join(cwd, "lode"))) return undefined;

	// Preferred: shell out to the CLI so the file list and format stay
	// owned by `lode startup` rather than duplicated here.
	try {
		const out = execSync("lode startup", {
			cwd,
			encoding: "utf8",
			timeout: 5000,
			stderr: "pipe",
		});
		const chars = Buffer.byteLength(out, "utf8");
		return {
			content: `${PREFIX}\n${out}`,
			status: `lode: startup, ${chars} chars`,
		};
	} catch {
		// lode not installed or failed — fall through to manual reads.
	}

	// Fallback: read the entry files directly.
	const sections: string[] = [];
	const omitted: Array<{ file: string; chars: number }> = [];
	let found = 0;
	let used = 0;

	for (const rel of FILES) {
		let body: string;
		try {
			body = fs.readFileSync(path.join(cwd, rel), "utf8");
		} catch {
			continue;
		}
		found++;
		const chars = Buffer.byteLength(body, "utf8");
		// Whole files only. An oversized file is named rather than truncated, and
		// never allowed to starve the ones after it.
		if (used + chars <= BUDGET) {
			used += chars;
			sections.push(`=== ${rel} ===\n${body}`);
		} else {
			omitted.push({ file: rel, chars });
		}
	}

	if (found === 0) return undefined;

	let content = `${PREFIX}\n${sections.join("\n")}`;
	if (omitted.length > 0) {
		const detail = omitted.map(o => `- ${o.file} (${o.chars} chars)`).join("\n");
		content += `\n=== over the ${BUDGET}-char budget, NOT loaded — read these before exploring ===\n${detail}\n`;
	}

	const names = omitted.map(o => path.basename(o.file)).join(", ");
	const status =
		omitted.length > 0
			? `lode: ${sections.length}/${found} files, ${used} chars — omitted ${names} (read them)`
			: `lode: ${sections.length} file${sections.length === 1 ? "" : "s"}, ${used} chars (fallback — lode CLI not found)`;

	return { content, status };
}

export default function hook(pi: HookAPI): void {
	const inject = (ctx: HookContext): void => {
		if (!isFreshConversation(ctx)) return;
		const payload = buildPayload(ctx.cwd);
		if (!payload) return;

		pi.logger.info(payload.status);
		pi.sendMessage({
			customType: MARKER,
			content: payload.content,
			display: false,
			attribution: "agent",
			details: { status: payload.status },
		});
	};

	// Launching into a fresh conversation. Fires per process; the guard rejects
	// the resume case.
	pi.on("session_start", async (_event, ctx) => inject(ctx));

	// `/new` inside a running process. `resume` lands on a populated
	// conversation and `fork`/`handoff` on an inherited one, so the guard
	// rejects those without needing to read `reason`.
	pi.on("session_switch", async (_event, ctx) => inject(ctx));
}
