import { describe, expect, test } from "bun:test";
import { convertMessageToLlm } from "@oh-my-pi/pi-agent-core/compaction/messages";
import type { ImageContent, TextContent } from "@oh-my-pi/pi-ai";

// LOCAL BUILD: custom/hook messages convert to `role: "developer"`, which the
// Anthropic wire builder pushes as `{role: "user"}`. Its promotion back to a
// mid-conversation `system` param requires the official api.anthropic.com host,
// so on a gateway build nothing is ever promoted and harness output would arrive
// indistinguishable from something the user typed. The envelope added in
// `convertMessageToLlm` is the only marker these messages get here.

function developerText(message: Parameters<typeof convertMessageToLlm>[0]): string {
	const converted = convertMessageToLlm(message);
	if (converted === undefined) throw new Error("expected a converted message");
	// A throwing check, not just expect(): `Message` is a union across roles, so
	// only narrowing to `developer` makes `content` the text/image pair.
	if (converted.role !== "developer") throw new Error(`expected developer role, got ${converted.role}`);
	const content = converted.content;
	if (typeof content === "string") return content;
	return content
		.filter((block): block is TextContent => block.type === "text")
		.map(block => block.text)
		.join("\n");
}

describe("harness-notice envelope", () => {
	test("wraps an agent-attributed custom message and keeps its text", () => {
		const text = developerText({
			role: "custom",
			customType: "launch-completion",
			content: "Supervised process runIde exited with exit code 0.",
			display: true,
			attribution: "agent",
			timestamp: 1,
		});

		expect(text).toContain('<system-notice type="launch-completion">');
		expect(text).toContain("not typed by the user");
		expect(text).toContain("Supervised process runIde exited with exit code 0.");
	});

	test("treats missing attribution as harness-originated", () => {
		// `normalizeCustomMessageAttribution` resolves undefined to "agent"; the
		// envelope has to agree or an unattributed hook message stays unmarked.
		const text = developerText({
			role: "hookMessage",
			customType: "clock",
			content: "Turn started: 2026-08-12 14:00.",
			display: true,
			timestamp: 1,
		});

		expect(text).toContain('<system-notice type="clock">');
		expect(text).toContain("Turn started: 2026-08-12 14:00.");
	});

	test("leaves user-attributed messages unwrapped", () => {
		// Collab prompts and user-invoked skill prompts really were authored by the
		// user; marking them as harness output would be a lie the model acts on.
		const text = developerText({
			role: "custom",
			customType: "collab-prompt",
			content: "please rerun the failing test",
			display: true,
			attribution: "user",
			timestamp: 1,
		});

		expect(text).toBe("please rerun the failing test");
		expect(text).not.toContain("system-notice");
	});

	test("joins text blocks into one envelope and preserves images", () => {
		const image: ImageContent = { type: "image", data: "abc", mimeType: "image/png" };
		const converted = convertMessageToLlm({
			role: "custom",
			customType: "screenshot",
			content: [{ type: "text", text: "first" }, image, { type: "text", text: "second" }],
			display: true,
			attribution: "agent",
			timestamp: 1,
		});
		if (converted === undefined || converted.role !== "developer" || typeof converted.content === "string") {
			throw new Error("expected developer block content");
		}

		const texts = converted.content.filter((block): block is TextContent => block.type === "text");
		const images = converted.content.filter((block): block is ImageContent => block.type === "image");
		expect(texts).toHaveLength(1);
		expect(texts[0].text).toContain("first\nsecond");
		expect(images).toEqual([image]);
	});

	test("does not emit a bare envelope for text-free content", () => {
		const image: ImageContent = { type: "image", data: "abc", mimeType: "image/png" };
		const converted = convertMessageToLlm({
			role: "custom",
			customType: "screenshot",
			content: [image],
			display: true,
			attribution: "agent",
			timestamp: 1,
		});

		expect(converted?.content).toEqual([image]);
	});

	test("is a pure function of the message, independent of position", () => {
		// `wrapSteeringForModel` documents the failure this guards: bytes that vary
		// with array position rewrite an already-cached prefix and bust the provider
		// prompt cache from that message onward.
		const message = {
			role: "custom" as const,
			customType: "launch-completion",
			content: "exited",
			display: true,
			attribution: "agent" as const,
			timestamp: 1,
		};

		expect(developerText(message)).toBe(developerText(message));
	});
});
