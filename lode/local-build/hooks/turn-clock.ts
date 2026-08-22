/**
 * Stamp each turn with the local time.
 *
 * The prompt has no clock. `formatLocalCalendarDate()` yields `YYYY-MM-DD` with
 * no time of day, `dateTime` is assigned the same value, and it is computed once
 * at prompt build (`system-prompt.ts:787`) — recomputed only when the system
 * prompt is rebuilt on a tool-set change, not per turn.
 *
 * So a session opened last night reports yesterday's date and no hour, for as
 * long as it stays open. Two agents concluded it was still last night and
 * suggested going to bed; it was 2PM the following day. That is a correct
 * inference from the only temporal fact available to them.
 *
 * `before_agent_start` fires after the user submits and before the agent loop,
 * and its result injects a persisted message — so each turn gets one small
 * immutable stamp. Immutable matters: the entry never changes once written, so it
 * costs nothing in prefix caching, unlike a single refreshed clock would.
 *
 * The accumulated stamps also give a real timeline — how long a session has run,
 * where the gaps are, whether "earlier today" means an hour ago or Tuesday.
 *
 * Deliberately not a `context` hook: that would rewrite one always-current
 * timestamp per LLM call, which changes a message every request and defeats the
 * cache for the whole conversation behind it.
 */
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

/** e.g. "Mon 2026-08-10 14:15 EDT" — weekday and zone included, both cheap and both load-bearing for "is it late?". */
function stamp(now: Date): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZoneName: "short",
	}).formatToParts(now);
	const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
	return `${get("weekday")} ${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} ${get("timeZoneName")}`;
}

export default function hook(pi: HookAPI): void {
	pi.on("before_agent_start", async () => ({
		message: {
			customType: "clock",
			content: `Turn started: ${stamp(new Date())} (local).`,
			display: false,
			attribution: "agent" as const,
		},
	}));
}
